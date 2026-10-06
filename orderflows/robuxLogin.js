const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require('discord.js');

const { getDisabledItems } = require('../database/supabase');
const items   = require('../data/items');
const session = require('./sessionManager');

const FLOW = 'rl';

/* ──────────────────────────────
   Helper
────────────────────────────── */

async function sendStep(interaction, data) {

  const payload = { ...data, ephemeral: true };

  if (interaction.replied || interaction.deferred)
    return interaction.followUp(payload);

  return interaction.reply(payload);
}

/* ──────────────────────────────
   Replace Step
────────────────────────────── */

async function replaceStep(interaction, data) {

  return interaction.update({
    ...data,
    ephemeral: true
  });

}

/* ──────────────────────────────
   PRICE LIST (Ephemeral)
────────────────────────────── */

async function showPriceList(interaction) {

  await interaction.deferReply({ flags: 64 });

  const disabled = await getDisabledItems('robuxLogin','packages');

  const available = items.robuxLoginPackages.filter(
    p => !disabled.includes(p.value)
  );

  const bannerPath = path.join(__dirname, '..', 'pricing.png');
  const banner = new AttachmentBuilder(bannerPath, { name: 'pricing.png' });

  const embed = new EmbedBuilder()
    .setTitle('🧳 Robux Via Login – Price List')
    .setColor(0x5865F2)
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' })
    .setTimestamp();

  let desc = '';

  available.forEach(p => {
    desc += `⏣ ${p.label}\n`;
  });

  embed.setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rl_order')
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

/* ──────────────────────────────
   Router
────────────────────────────── */

async function handleInteraction(interaction) {

  const id = interaction.customId;
  const userId = interaction.user.id;

  if (id === 'rl_order') {

    session.setSession(userId, { flow: FLOW, step: 1 });

    return showStep1(interaction);
  }

  if (id === 'rl_s1_yes' || id === 'rl_s1_no') {

    if (id === 'rl_s1_no') {

      session.deleteSession(userId);

      return replaceStep(interaction,{
        content:'❌ Order cancelled.',
        embeds:[],
        components:[]
      });
    }

    session.updateSession(userId,{step:2});

    return showStep2(interaction);
  }

  if (id === 'rl_s2_yes' || id === 'rl_s2_no') {

    if (id === 'rl_s2_no') {

      session.deleteSession(userId);

      return replaceStep(interaction,{
        content:'❌ Order cancelled.',
        embeds:[],
        components:[]
      });
    }

    session.updateSession(userId,{step:3});

    return showStep3(interaction);
  }

  if (id === 'rl_package_select') {

    const selected = interaction.values[0];

    const pkg = items.robuxLoginPackages.find(p=>p.value===selected);

    session.updateSession(userId,{
      step:4,
      package:pkg.label
    });

    return showSummary(interaction);
  }

  if (id === 'rl_create_ticket')
    return createTicket(interaction);

  if (id === 'rl_cancel') {

    session.deleteSession(userId);

    return replaceStep(interaction,{
      content:'❌ Order cancelled.',
      embeds:[],
      components:[]
    });
  }
}

/* ──────────────────────────────
   Step 1
────────────────────────────── */

async function showStep1(interaction){

  const embed = new EmbedBuilder()
  .setTitle(' ⚠️ Mohon di baca dan pahami ⚠️')
  .setColor(0x5865F2)
  .setDescription('Sudah mengerti topup Robux Via login?');

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('rl_s1_yes')
      .setLabel(' ✅️ Ya')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('rl_s1_no')
      .setLabel('❌ Tidak')
      .setStyle(ButtonStyle.Danger)
  );

  return sendStep(interaction,{embeds:[embed],components:[row]});
}

/* ──────────────────────────────
   Step 2
────────────────────────────── */

async function showStep2(interaction){

  const embed = new EmbedBuilder()
    .setTitle(' ⚠️ Mohon di baca dan pahami ⚠️')
    .setColor(0x5865F2)
    .setDescription('Top up Robux via login dapat Merubah region');

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('rl_s2_yes')
      .setLabel('✅️ Setuju')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('rl_s2_no')
      .setLabel('❌ Tidak')
      .setStyle(ButtonStyle.Danger)
  );

  return replaceStep(interaction,{embeds:[embed],components:[row]});
}

/* ──────────────────────────────
   Step 3
────────────────────────────── */

async function showStep3(interaction){

  const disabled = await getDisabledItems('robuxLogin','packages');

  const available = items.robuxLoginPackages.filter(
    p => !disabled.includes(p.value)
  );

  if (available.length===0){

    return replaceStep(interaction,{
      content:'⚠️ No packages available right now.',
      embeds:[],
      components:[]
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔎 Detail Paket 🔎')
    .setColor(0x5865F2)
    .setDescription('👉 Pilih jumlah robux / paket');

  const select = new StringSelectMenuBuilder()
    .setCustomId('rl_package_select')
    .setPlaceholder('Pilih item...')
    .addOptions(available);

  const row = new ActionRowBuilder().addComponents(select);

  return replaceStep(interaction,{embeds:[embed],components:[row]});
}

/* ──────────────────────────────
   Summary
────────────────────────────── */

async function showSummary(interaction){

  const s = session.getSession(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
    `📋 **Produk:** Robux Via Login\n` +
    `📦 **Paket:** ${s.package}`
  );

  const row = new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId('rl_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('rl_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return replaceStep(interaction,{embeds:[embed],components:[row]});
}

/* ──────────────────────────────
   Ticket
────────────────────────────── */

async function createTicket(interaction){

  const { createTicket: openTicket } = require('../tickets/createTicket');

  const s = session.getSession(interaction.user.id);

  const summary = `**📋Produk:** Robux Via Login
  **📦Paket yang di pesan:** ${s.package}`;

const instruction = `📌 **Instruksi:**
• Pengiriman Robux dilakukan oleh admin via login
• Mohon standby untuk memberikan kode
• Proses dilakukan sesuai antrian (jika mengantri)
• Selesaikan pembayaran sesuai arahan admin
• Pastikan username & password kamu sudah benar sebelum admin memproses
• Setelah selesai, tiket akan ditutup oleh admin`;

  await openTicket(interaction,{
    orderType:'Robux Via Login',
    categoryKey:'robuxLogin',
    summaryText:summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

module.exports = { showPriceList, handleInteraction };
