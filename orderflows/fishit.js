const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const items = require('../data/items');
const session = require('./sessionManager');
const { getDisabledItems, getEnabledItems } = require('../database/supabase');

const FLOW = 'fi';

/* ───────────────────────────────────── */

async function loadItems(game, category) {

  const g = game.toLowerCase().trim();
  const c = category.toLowerCase().trim();

  const base = items[g]?.[c] ?? [];

  const [disabledRaw, enabledRaw] = await Promise.all([
    getDisabledItems(g, c),
    getEnabledItems(g, c),
  ]);

  const disabledSet = new Set(
    disabledRaw.map(v => v.toLowerCase().trim())
  );

  const enabled = enabledRaw
  .map(i => ({
    label: i.label,
    value: i.value.toLowerCase().trim()
  }))
  .filter(e => !disabledSet.has(e.value)); // 🔥 THIS LINE FIXES EVERYTHING

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

  const banner = new AttachmentBuilder('./pricing.png', { name: 'pricing.png' });

  const [gamepass, crates] = await Promise.all([
    loadItems('fishit', 'gamepass'),
    loadItems('fishit', 'crate'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('🐟Fish it - Price List')
    .setColor(0x5865F2)
    .setDescription(
`**GAMEPASS :**
${gamepass.map(i => i.label).join('\n') || '*Currently unavailable*'}

**CRATE / SPIN WHEELS :**
${crates.map(i => i.label).join('\n') || '*Currently unavailable*'}
`)
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fi_order')
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

  const id = interaction.customId;
  const userId = interaction.user.id;

    if (id === 'fi_order') {
    session.setSession(userId, { 
      flow: FLOW, 
      step: 1,
      cart: []
    });
  
    return showUsernameModal(interaction);
  }

  if (interaction.isModalSubmit() && id === 'fi_username_modal') {

    const username = interaction.fields.getTextInputValue('fi_username');

    session.updateSession(userId, {
      step: 2,
      username
    });

    return showCategorySelect(interaction);
  }

  if (id === 'fi_cat_select') {

    const category = interaction.values[0];

    session.updateSession(userId, {
      step: 3,
      category
    });

    return showItemSelect(interaction, category);
  }
  if (id.startsWith('fi_prev_') || id.startsWith('fi_next_')) {

  const s = session.getSession(userId);

  let page = Number(id.split('_')[2]);

  if (id.startsWith('fi_prev_')) {
    page--;
  } else {
    page++;
  }

  return showItemSelect(interaction, s.category, page);
}

  if (id === 'fi_item_select') {

    const selected = interaction.values[0];
    const s = session.getSession(userId);

    const allItems = await loadItems('fishit', s.category);
    const item = allItems.find(i => i.value === selected);

    const userSession = session.getSession(userId);

    if (!userSession.cart) userSession.cart = [];
    
    userSession.cart.push({
      category: userSession.category,
      item: item?.label ?? selected
    });
    
    session.updateSession(userId, {
      cart: userSession.cart,
      step: 'add_more'
    });
    
    return askAddMore(interaction);
  }
  if (id === 'fi_add_yes') {

  session.updateSession(userId, {
    step: 2,
    category: null,
    item: null
  });

  return showCategorySelect(interaction);
}

if (id === 'fi_add_no') {
  return showSummary(interaction);
}
  if (id === 'fi_create_ticket')
    return createTicket(interaction);

  if (id === 'fi_cancel') {

    session.deleteSession(userId);

    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: []
    });
  }
}
async function askAddMore(interaction) {

  const embed = new EmbedBuilder()
    .setTitle('🛒 Tambah Item?')
    .setColor(0x5865F2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fi_add_yes')
      .setLabel('Tambah Item')
      .setStyle(ButtonStyle.Primary), // 🔵 BLUE

    new ButtonBuilder()
      .setCustomId('fi_add_no')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Primary) // 🔵 BLUE
  );

  return interaction.update({
    content: '',
    embeds: [embed],
    components: [row]
  });
}
/* ───────────────────────────────────── */

async function showUsernameModal(interaction) {

  const modal = new ModalBuilder()
    .setCustomId('fi_username_modal')
    .setTitle('🐟 Fish It - Order');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('fi_username')
        .setLabel('👤 Username')
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
    .setCustomId('fi_cat_select')
    .setPlaceholder('pilih kategori...')
    .addOptions(items.fishit.categories);

  const payload = {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true
  };

  // 🔥 IMPORTANT PART
  if (interaction.isButton()) {
    return interaction.update(payload);   // replace (Add More case)
  } else {
    return interaction.reply(payload);    // modal case
  }
}

/* ───────────────────────────────────── */

async function showItemSelect(interaction, category, page = 0) {

  const available = await loadItems('fishit', category);

  if (available.length === 0) {
    return interaction.update({
      content: '⚠️ No items are currently available in this category.',
      embeds: [],
      components: []
    });
  }

  const PAGE_SIZE = 25;
  const totalPages = Math.ceil(available.length / PAGE_SIZE);
  page = Math.max(0, Math.min(page, totalPages - 1));

  const pageItems = available.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setDescription(
      `🛒 Pilih item yang ingin di beli\n\nPage ${page + 1}/${totalPages}`
    )
    .setColor(0xFEE75C);

  const select = new StringSelectMenuBuilder()
    .setCustomId('fi_item_select')
    .setPlaceholder(`Pilih Item • Page ${page + 1}/${totalPages}`)
    .addOptions(pageItems);

  const rows = [
    new ActionRowBuilder().addComponents(select)
  ];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fi_prev_${page}`)
          .setLabel('⬅ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId(`fi_next_${page}`)
          .setLabel('Next ➡')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      )
    );
  }

  return interaction.update({
    embeds: [embed],
    components: rows
  });
}

/* ───────────────────────────────────── */

async function showSummary(interaction) {

  const s = session.getSession(interaction.user.id);

  let itemsText = "";

  (s.cart || []).forEach((entry, i) => {
    itemsText += `\n${i + 1}. ${entry.category} → ${entry.item}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** Fish It\n` +
      `👤 **Username:** ${s.username}\n` +
      `🛒 **Items:** ${itemsText}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fi_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('fi_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({
    embeds: [embed],
    components: [row]
  });
}

/* ───────────────────────────────────── */

async function createTicket(interaction) {

  const { createTicket: openTicket } = require('../tickets/createTicket');
  const s = session.getSession(interaction.user.id);

  let itemsText = "";

  (s.cart || []).forEach((entry, i) => {
    itemsText += `\n${i + 1}. ${entry.category} → ${entry.item}`;
  });

  const summary =
`**📋 Produk:** Fish It
**👤 Username:** ${s.username}
**🛒 Items:** ${itemsText}`;

  const instruction =
`📌** Instruksi:**
• Pengiriman Item di Private Server yang kami berikan
• Mohon tunggu admin untuk gift item mu di Ps kami.
• Proses di lakukan sesuai antrian ( jika mengantri )
• Selesaikan pembayaran sesuai arahan admin.
• Pastikan username Roblox kamu sudah benar sebelum admin memproses.
• Setelah selesai, tiket akan ditutup oleh admin.`;

  await openTicket(interaction, {
    orderType: 'Fish It',
    categoryKey: 'games',
    summaryText: summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

/* ───────────────────────────────────── */

module.exports = {
  showPriceList,
  handleInteraction
};
