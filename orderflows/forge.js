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

const FLOW = 'fo';


/* =================================
   LOAD ITEMS (items.js + DB)
================================= */

async function loadItems(category){

  const c = category.toLowerCase().trim();

  const base = items.forge[c] ?? [];

  const [enabledRaw, disabledRaw] = await Promise.all([
    getEnabledItems('forge', c),
    getDisabledItems('forge', c),
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


/* =================================
   PRICE LIST
================================= */

async function showPriceList(interaction){

  await interaction.deferReply({ ephemeral:true });

  const banner = new AttachmentBuilder('./pricing.png',{name:'pricing.png'});

  const [gamepass, totems, rerolls, cashpack] = await Promise.all([
    loadItems('gamepass'),
    loadItems('totems'),
    loadItems('rerolls'),
    loadItems('cashpack'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('⛏️ The Forge')
    .setColor(0x5865F2)
    .setDescription(`
🎮 **GAMEPASS**
${gamepass.map(i=>i.label).join('\n') || '*Unavailable*'}

🔮 **TOTEMS**
${totems.map(i=>i.label).join('\n') || '*Unavailable*'}

🔄 **REROLLS**
${rerolls.map(i=>i.label).join('\n') || '*Unavailable*'}

💰 **CASH PACK**
${cashpack.map(i=>i.label).join('\n') || '*Unavailable*'}
`)
    .setImage('attachment://pricing.png')
    .setFooter({ text:'MoonBlox • Click Order to proceed' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fo_order')
      .setLabel('Order')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛒')
  );

  await interaction.editReply({
    embeds:[embed],
    components:[row],
    files:[banner]
  });

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

/* =================================
   INTERACTION HANDLER
================================= */

async function handleInteraction(interaction){

  const id = interaction.customId;
  const userId = interaction.user.id;

  if(id === 'fo_order'){
  return showUsernameModal(interaction);
}
  if(interaction.isModalSubmit() && id==='fo_username_modal'){

  const username = interaction.fields.getTextInputValue('fo_username');

  session.setSession(userId,{
    flow:FLOW,
    step:2,
    username,
    cart:[]
  });

  // ✅ ACK FIRST (IMPORTANT)
  await interaction.deferReply({ ephemeral: true });

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setColor(0x5865F2)
    .setDescription('🛒 Pilih kategori yang ingin di beli 🛒');

  const select = new StringSelectMenuBuilder()
    .setCustomId('fo_cat_select')
    .setPlaceholder('Pilih kategori...')
    .addOptions(items.forge.categories);

  // ✅ THIS REPLACES UI (what you want)
  return interaction.editReply({
    embeds:[embed],
    components:[new ActionRowBuilder().addComponents(select)]
  });
}


  if(id==='fo_cat_select'){
    const category = interaction.values[0];
    session.updateSession(userId,{step:3,category});
    return showPackageSelect(interaction,category);
  }
  if(id==='fo_add_yes'){

  session.updateSession(userId,{
    step:2,
    category:null
  });

  return showCategorySelect(interaction); // 🔁 replace message
}

if(id==='fo_add_no'){
  return showSummary(interaction);
}
  if(id==='fo_package_select'){

  const selected = interaction.values[0];
  const s = session.getSession(userId);

  const list = await loadItems(s.category);
  const pkg = list.find(i=>i.value===selected);

  if(!s.cart) s.cart = [];

  s.cart.push({
    category: s.category,
    item: pkg?.label ?? selected
  });

  session.updateSession(userId,{
    cart: s.cart,
    step: 'add_more'
  });

  return askAddMore(interaction); // 🔥 NEW
}

  if(id==='fo_create_ticket') return createTicket(interaction);

  if(id==='fo_cancel'){
    session.deleteSession(userId);
    return interaction.update({
      content:'❌ Order cancelled.',
      embeds:[],
      components:[]
    });
  }

}


/* =================================
   USERNAME MODAL
================================= */

async function showUsernameModal(interaction){

  const modal = new ModalBuilder()
    .setCustomId('fo_username_modal')
    .setTitle('⛏️ The Forge Gift Gamepass Form');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('fo_username')
        .setLabel('👤 Username:')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);

}


/* =================================
   CATEGORY SELECT
================================= */

async function showCategorySelect(interaction){

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setColor(0x5865F2)
    .setDescription('🛒 Pilih kategori yang ingin di beli 🛒');

  const select = new StringSelectMenuBuilder()
    .setCustomId('fo_cat_select')
    .setPlaceholder('Pilih kategori...')
    .addOptions(items.forge.categories);

  const payload = {
    embeds:[embed],
    components:[new ActionRowBuilder().addComponents(select)],
    ephemeral:true
  };

  // ✅ HANDLE ALL TYPES SAFELY
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    return interaction.update(payload);
  }

  // ✅ modal submit case
  return interaction.reply(payload);
}

/* =================================
   PACKAGE SELECT
================================= */

async function showPackageSelect(interaction,category){

  const available = await loadItems(category);

  if(available.length===0){
    return interaction.update({
      content:'⚠️ No items available in this category right now.',
      embeds:[],
      components:[]
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Produk 🛍️')
    .setColor(0x5865F2)
    .setDescription('🛒 Pilih item yang di inginkan');

  const select = new StringSelectMenuBuilder()
    .setCustomId('fo_package_select')
    .setPlaceholder('Pilih Gamepass...')
    .addOptions(available);

  return interaction.update({
    embeds:[embed],
    components:[new ActionRowBuilder().addComponents(select)]
  });

}


/* =================================
   SUMMARY
================================= */

async function showSummary(interaction){

  const s = session.getSession(interaction.user.id);

  let itemsText = "";

  (s.cart || []).forEach((entry,i)=>{
    itemsText += `\n${i+1}. ${entry.category} → ${entry.item}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(' 🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** The Forge\n` +
      `👤 **Username:** ${s.username}\n` +
      `🛒 **Items:** ${itemsText}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fo_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('fo_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({
    embeds:[embed],
    components:[row]
  });
}


/* =================================
   CREATE TICKET
================================= */

async function createTicket(interaction){

  const { createTicket:openTicket } = require('../tickets/createTicket');

  const s = session.getSession(interaction.user.id);

  let itemsText = "";

  (s.cart || []).forEach((entry,i)=>{
    itemsText += `\n${i+1}. ${entry.category} → ${entry.item}`;
  });

  const summary =
`**📋 Produk:** ⛏️ The Forge
**👤 Username:** ${s.username}
**🛒 Items:** ${itemsText}`;

  const instruction =
`📌 **Instruksi:**
• Pengiriman Item di Private Server yang kami berikan
• Mohon tunggu admin untuk gift item mu di Ps kami.
• Proses di lakukan sesuai antrian ( jika mengantri )
• Selesaikan pembayaran sesuai arahan admin.
• Pastikan username Roblox kamu sudah benar sebelum admin memproses.
• Setelah selesai, tiket akan ditutup oleh admin.`;

  await openTicket(interaction,{
    orderType:'The Forge',
    categoryKey:'games',
    summaryText:summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

module.exports={showPriceList,handleInteraction};
