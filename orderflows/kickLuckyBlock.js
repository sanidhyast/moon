const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require('discord.js');

const items = require('../data/items');
const session = require('./sessionManager');
const { getDisabledItems, getEnabledItems } = require('../database/supabase');

const FLOW = 'klb';

/* ───────────────────────────────────── */

async function loadItems(category) {
  const g = 'kickLuckyBlock';
  const c = category.toLowerCase().trim();

  const base = items[g]?.[c] ?? [];

  const [disabledRaw, enabledRaw] = await Promise.all([
    getDisabledItems(g, c),
    getEnabledItems(g, c),
  ]);

  const disabledSet = new Set(disabledRaw.map(v => v.toLowerCase().trim()));

  const enabled = enabledRaw
    .map(i => ({ label: i.label, value: i.value.toLowerCase().trim() }))
    .filter(e => !disabledSet.has(e.value));

  const baseFiltered = base.filter(
    i => !disabledSet.has(i.value.toLowerCase().trim())
  );

  const enabledFiltered = enabled.filter(
    e => !base.some(b => b.value.toLowerCase().trim() === e.value)
  );

  return [...baseFiltered, ...enabledFiltered];
}

/* ───────────────────────────────────── */

async function showPriceList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const banner   = new AttachmentBuilder('./pricing.png', { name: 'pricing.png' });
  const [boosts, gamepass, cashpack] = await Promise.all([
    loadItems('boost'),
    loadItems('gamepass'),
    loadItems('cashpack'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('🍀 Kick a Lucky Block – Price List')
    .setColor(0x5865F2)
    .setDescription(
`**BOOST :**
${boosts.map(i => i.label).join('\n') || '*Currently unavailable*'}

**GAMEPASS :**
${gamepass.map(i => i.label).join('\n') || '*Currently unavailable*'}

**CASH PACK :**
${cashpack.map(i => i.label).join('\n') || '*Currently unavailable*'}
`
    )
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('klb_order')
      .setLabel('Order')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛒')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    files: [banner]
  });
}

/* ───────────────────────────────────── */

async function handleInteraction(interaction) {
  const id     = interaction.customId;
  const userId = interaction.user.id;

  if (id === 'klb_order') {
    session.setSession(userId, { flow: FLOW, step: 1, cart: [] });
    return showUsernameModal(interaction);
  }

  if (interaction.isModalSubmit() && id === 'klb_username_modal') {
    const username = interaction.fields.getTextInputValue('klb_username');
    session.updateSession(userId, { step: 2, username });
    return showCategorySelect(interaction);
  }

  if (id === 'klb_cat_select') {
    const category = interaction.values[0];
    session.updateSession(userId, { step: 3, category });
    return showItemSelect(interaction, category);
  }

  if (id === 'klb_item_select') {
    const selected = interaction.values[0];
    const s        = session.getSession(userId);
    const allItems = await loadItems(s.category);
    const item     = allItems.find(i => i.value === selected);

    if (!s.cart) s.cart = [];
    s.cart.push({ category: s.category, item: item?.label ?? selected });
    session.updateSession(userId, { cart: s.cart, step: 'add_more' });
    return askAddMore(interaction);
  }

  if (id === 'klb_add_yes') {
    session.updateSession(userId, { step: 2, category: null, item: null });
    return showCategorySelect(interaction);
  }

  if (id === 'klb_add_no')        return showSummary(interaction);
  if (id === 'klb_create_ticket') return createTicket(interaction);

  if (id === 'klb_cancel') {
    session.deleteSession(userId);
    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: []
    });
  }
}

/* ───────────────────────────────────── */

async function showUsernameModal(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId('klb_username_modal')
    .setTitle('🍀 Kick a Lucky Block – Order');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('klb_username')
        .setLabel('👤 Username Roblox')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

/* ───────────────────────────────────── */

async function showCategorySelect(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Pilih kategori yang di inginkan 🛒')
    .setColor(0x5865F2);

  const select = new StringSelectMenuBuilder()
    .setCustomId('klb_cat_select')
    .setPlaceholder('Pilih kategori...')
    .addOptions(items.kickLuckyBlock.categories);

  const payload = {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true
  };

  if (interaction.isButton()) return interaction.update(payload);
  return interaction.reply(payload);
}

/* ───────────────────────────────────── */

async function showItemSelect(interaction, category) {
  const available = await loadItems(category);

  if (available.length === 0) {
    return interaction.update({
      content: '⚠️ No items are currently available in this category.',
      embeds: [],
      components: []
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setColor(0xFEE75C)
    .setDescription('🛒 Pilih item yang ingin di beli 🛒');

  const select = new StringSelectMenuBuilder()
    .setCustomId('klb_item_select')
    .setPlaceholder('Pilih Items...')
    .addOptions(available);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

/* ───────────────────────────────────── */

async function askAddMore(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🛒 Tambah Item?')
    .setColor(0x5865F2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('klb_add_yes')
      .setLabel('Tambah Item')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('klb_add_no')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  return interaction.update({ content: '', embeds: [embed], components: [row] });
}

/* ───────────────────────────────────── */

async function showSummary(interaction) {
  const s = session.getSession(interaction.user.id);

  let itemsText = '';
  (s.cart || []).forEach((entry, i) => {
    itemsText += `\n${i + 1}. ${entry.category} → ${entry.item}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** Kick a Lucky Block\n` +
      `👤 **Username:** ${s.username}\n` +
      `🛒 **Items:** ${itemsText}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('klb_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('klb_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({ embeds: [embed], components: [row] });
}

/* ───────────────────────────────────── */

async function createTicket(interaction) {
  const { createTicket: openTicket } = require('../tickets/createTicket');
  const s = session.getSession(interaction.user.id);

  let itemsText = '';
  (s.cart || []).forEach((entry, i) => {
    itemsText += `\n${i + 1}. ${entry.category} → ${entry.item}`;
  });

  const summary =
`**📋 Produk:** Kick a Lucky Block
**👤 Username:** ${s.username}
**🛒 Items:** ${itemsText}`;

  const instruction =
`📌 **Instruksi:**
• Pengiriman Item di Private Server yang kami berikan
• Mohon tunggu admin untuk gift item mu di PS kami.
• Proses dilakukan sesuai antrian (jika mengantri)
• Selesaikan pembayaran sesuai arahan admin.
• Pastikan username Roblox kamu sudah benar sebelum admin memproses.
• Setelah selesai, tiket akan ditutup oleh admin.`;

  await openTicket(interaction, {
    orderType:       'Kick a Lucky Block',
    categoryKey:     'games',
    summaryText:     summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

/* ───────────────────────────────────── */

module.exports = { showPriceList, handleInteraction };
