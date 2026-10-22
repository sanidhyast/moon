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

const {
  getDisabledItems,
  getEnabledItems
} = require('../database/supabase');

const FLOW = 'si';


/* ===============================
   LOAD ITEMS (items.js + DB)
================================ */

async function loadItems(category) {

  const c = category.toLowerCase().trim();

  const base = items.sawahIndo[c] ?? [];

  const [enabledRaw, disabledRaw] = await Promise.all([
    getEnabledItems('sawahIndo', c),
    getDisabledItems('sawahIndo', c),
  ]);

  // 🔥 normalize disabled
  const disabledSet = new Set(
    disabledRaw.map(v => v.toLowerCase().trim())
  );

  // 🔥 normalize base
  const baseSet = new Set(
    base.map(b => b.value.toLowerCase().trim())
  );

  // 🔥 filter base
  const baseFiltered = base.filter(
    i => !disabledSet.has(i.value.toLowerCase().trim())
  );

  // 🔥 normalize + filter enabled
  const enabled = enabledRaw
    .filter(i => i.value) // safety
    .map(i => ({
      label: i.label,
      value: i.value.toLowerCase().trim()
    }))
    .filter(i => !disabledSet.has(i.value));

  // 🔥 remove duplicates
  const enabledFiltered = enabled.filter(
    e => !baseSet.has(e.value)
  );

  return [...baseFiltered, ...enabledFiltered];
}


/* ===============================
   PRICE LIST
================================ */

async function showPriceList(interaction) {

  await interaction.deferReply({ ephemeral: true });

  const banner = new AttachmentBuilder('./pricing.png', { name: 'pricing.png' });

  const [gamepass, fiture] = await Promise.all([
    loadItems('gamepass'),
    loadItems('fiture'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('🌾 Sawah Indo')
    .setColor(0x5865F2)
    .setDescription(
`**GAMEPASS :**
${gamepass.map(i => i.label).join('\n') || '*Unavailable*'}

**FITURE :**
${fiture.map(i => i.label).join('\n') || '*Unavailable*'}
`)
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('si_order')
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


/* ===============================
   INTERACTION HANDLER
================================ */

async function handleInteraction(interaction) {

  const id = interaction.customId;
  const userId = interaction.user.id;

  if (id === 'si_order') {
    session.setSession(userId, { flow: FLOW, step: 1 });
    return showUsernameModal(interaction);
  }
  if(id === 'si_add_yes'){
  return showCategorySelect(interaction); // 🔁 go back to category
}

if(id === 'si_add_no'){
  return showSummary(interaction);
}
  if (interaction.isModalSubmit() && id === 'si_username_modal') {

  const username = interaction.fields.getTextInputValue('si_username');

  session.updateSession(userId, {
    step: 2,
    username
  });

  return showCategorySelect(interaction);
}

  if (id === 'si_category_select') {

    const category = interaction.values[0];

    session.updateSession(userId, {
      step: 3,
      category
    });

    return showItemSelect(interaction);
  }

  if (id === 'si_item_select') {

  const selected = interaction.values[0];
  const s = session.getSession(userId);

  const list = await loadItems(s.category);
  const item = list.find(i => i.value === selected);

  if (!s.cart) s.cart = [];

  s.cart.push({
    category: s.category,
    item: item?.label ?? selected
  });

  session.updateSession(userId, {
    cart: s.cart,
    step: 'add_more'
  });

  return askAddMore(interaction);
}
if (id === 'si_create_ticket') return createTicket(interaction);
if (id === 'si_cancel') {

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

/* ===============================
   USERNAME MODAL
================================ */

async function showUsernameModal(interaction) {

  const modal = new ModalBuilder()
    .setCustomId('si_username_modal')
    .setTitle('🌾 Sawah Indo Giftgamepass Order');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('si_username')
        .setLabel('👤Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);

}


/* ===============================
   CATEGORY SELECT
================================ */

async function showCategorySelect(interaction) {

  const embed = new EmbedBuilder()
    .setTitle(' 🛍️ Detail Produk 🛍️')
    .setColor(0x5865F2)
    .setDescription('🛒 Pilih kategori yang di inginkan 🛒');

  const select = new StringSelectMenuBuilder()
    .setCustomId('si_category_select')
    .setPlaceholder('Pilih kategori...')
    .addOptions(items.sawahIndo.categories);

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
  return interaction.update({
    content: null,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

return interaction.reply({
  embeds: [embed],
  components: [new ActionRowBuilder().addComponents(select)],
  ephemeral: true
});

}


/* ===============================
   ITEM SELECT
================================ */

async function showItemSelect(interaction) {

  const userId = interaction.user.id;
  const s = session.getSession(userId);

  const available = await loadItems(s.category);

  if (available.length === 0) {

    return interaction.reply({
      content: '⚠️ No items available right now.',
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setColor(0x5865F2)
    .setDescription('🛒 Pilih item yang di inginkan');

  const select = new StringSelectMenuBuilder()
    .setCustomId('si_item_select')
    .setPlaceholder('Pilih item...')
    .addOptions(available);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });

}


/* ===============================
   SUMMARY
================================ */

async function showSummary(interaction) {

  const s = session.getSession(interaction.user.id);

  // 🔥 build items list
  let itemsText = "";

  (s.cart || []).forEach((entry, i)=>{
    itemsText += `\n${i+1}. ${entry.category} → ${entry.item}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(' 🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** Sawah Indo\n` +
      `👤 **Username:** ${s.username}\n` +
      `🛒 **Items:** ${itemsText || 'None'}`
    )
    .setFooter({ text: 'Review your order then click Create Ticket.' });

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('si_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('si_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)

  );

  return interaction.update({
    embeds: [embed],
    components: [row]
  });
}


/* ===============================
   CREATE TICKET
================================ */

async function createTicket(interaction) {

  const { createTicket: openTicket } = require('../tickets/createTicket');

  const s = session.getSession(interaction.user.id);

  // 🔥 build items list
  let itemsText = "";

  (s.cart || []).forEach((entry, i)=>{
    itemsText += `\n${i+1}. ${entry.category} → ${entry.item}`;
  });

  const summary =
`**📋Produk:** 🌾Sawah Indo
**👤Username:** ${s.username}
**🛒Items:** ${itemsText || 'None'}`;

  const instruction =
`📌 **Instruksi:**
• Pengiriman Item di Private Server yang kami berikan
• Mohon tunggu admin untuk gift item mu di Ps kami.
• Proses di lakukan sesuai antrian ( jika mengantri )
• Selesaikan pembayaran sesuai arahan admin.
• Pastikan username Roblox kamu sudah benar sebelum admin memproses.
• Setelah selesai, tiket akan ditutup oleh admin.`;

  await openTicket(interaction, {
    orderType: 'Sawah Indo',
    categoryKey: 'games',
    summaryText: summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}
module.exports = { showPriceList, handleInteraction };
