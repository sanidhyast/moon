const path = require('path');
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

const { getDisabledItems, getEnabledItems } = require('../database/supabase');
const items   = require('../data/items');
const session = require('./sessionManager');
const FLOW = 'ru';

/* ───────────────────────────────────── */

async function loadPackages() {
  const base = items.robuxUsernamePackages ?? [];

  const [disabledRaw, enabledRaw] = await Promise.all([
    getDisabledItems('robuxUsername', 'packages'),
    getEnabledItems('robuxUsername', 'packages'),
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
  await interaction.deferReply({ flags: 64 });

  const available = await loadPackages();

  const bannerPath = path.join(__dirname, '..', 'pricing.png');
  const banner = new AttachmentBuilder(bannerPath, { name: 'pricing.png' });

  const embed = new EmbedBuilder()
    .setTitle('🎮 Robux Via Username – Price List')
    .setColor(0x5865F2)
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' })
    .setTimestamp();

  let desc = 'Rate: **145 / ⏣1**\n\n';
  available.forEach(p => {
    desc += `${p.label}\n`;
  });

  desc += '\n📌 **Requirements :**\n';
  desc += '- 1 akun hanya bisa menerima 500rbx dalam 24jam\n';
  desc += '- Book lebih dari 500rbx di perbolehkan , dengan ketersediaan menunggu cooldown\n';
  desc += '- Robux yang di pake legal **TIDAK AKAN KE ROLLBACK**';

  embed.setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ru_order')
      .setLabel('Order')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🛒')
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
    files: [banner],
  });
}

/* ───────────────────────────────────── */

async function handleInteraction(interaction) {
  const id     = interaction.customId;
  const userId = interaction.user.id;

  /* ── Order clicked → confirm understanding ── */
  if (id === 'ru_order') {
    session.setSession(userId, { flow: FLOW, step: 1 });
    return showStep1(interaction);
  }

  /* ── Step 1: understood? ── */
  if (id === 'ru_s1_yes') {
    session.updateSession(userId, { step: 2 });
    return showUsernameModal(interaction);
  }

  if (id === 'ru_s1_no') {
    session.deleteSession(userId);
    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: []
    });
  }

  /* ── Username modal submitted ── */
  if (interaction.isModalSubmit() && id === 'ru_username_modal') {
    const username = interaction.fields.getTextInputValue('ru_username');
    session.updateSession(userId, { step: 3, username });
    return showPackageSelect(interaction);
  }

  /* ── Package selected ── */
  if (id === 'ru_package_select') {
    const selected = interaction.values[0];
    const pkgs     = await loadPackages();
    const pkg      = pkgs.find(p => p.value === selected);

    session.updateSession(userId, { step: 4, package: pkg?.label ?? selected });
    return showSummary(interaction);
  }

  if (id === 'ru_create_ticket') return createTicket(interaction);

  if (id === 'ru_cancel') {
    session.deleteSession(userId);
    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: []
    });
  }
}


/* ───────────────────────────────────── */

async function showStep1(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Robux via username')
    .setColor(0x5865F2)
    .setDescription(
      'Robux akan dikirim menggunakan metode Gift melalui username sesuai jumlah yang dipesan.\n' +
      'Pastikan username Roblox kamu aktif dan dapat menerima Robux.\n' +
      'Mohon tanya antrian terlebih dahulu ke admin di tiket, karna pembelian robux via username di batasi 500rbx/hari'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ru_s1_yes')
      .setLabel('✅ Ya')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('ru_s1_no')
      .setLabel('❌ Tidak')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

/* ───────────────────────────────────── */

async function showUsernameModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ru_username_modal')
    .setTitle('🎮 Robux Via Username – Order');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('ru_username')
        .setLabel('👤 Username Roblox')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Masukkan username Roblox kamu...')
    )
  );

  await interaction.showModal(modal);
}

/* ───────────────────────────────────── */

async function showPackageSelect(interaction) {
  const available = await loadPackages();

  if (available.length === 0) {
    return interaction.reply({ content: '⚠️ No packages available right now.', embeds: [], components: [], ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔎 Detail Paket 🔎')
    .setColor(0x5865F2)
    .setDescription('👉 Pilih jumlah Robux yang diinginkan');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ru_package_select')
    .setPlaceholder('Pilih paket...')
    .addOptions(available);

  return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
}

/* ───────────────────────────────────── */

async function showSummary(interaction) {
  const s = session.getSession(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** Robux Via Username\n` +
      `👤 **Username:** ${s.username}\n` +
      `📦 **Paket:** ${s.package}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ru_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('ru_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update( { embeds: [embed], components: [row] });
}

/* ───────────────────────────────────── */

async function createTicket(interaction) {
  const { createTicket: openTicket } = require('../tickets/createTicket');
  const s = session.getSession(interaction.user.id);

  const summary =
`**📋 Produk:** Robux Via Username
**👤 Username:** ${s.username}
**📦 Paket yang di pesan:** ${s.package}`;

  const instruction =
`📌 **Instruksi:**
• Pengiriman Robux dilakukan via Gift robux ke username
• Mohon standby dan pastikan username yang dimasukkan sudah benar
• Proses dilakukan sesuai antrian (jika mengantri)
• Selesaikan pembayaran sesuai arahan admin
• Setelah selesai, tiket akan ditutup oleh admin`;

  await openTicket(interaction, {
    orderType:       'Robux Via Username',
    categoryKey:     'robuxUsername',
    summaryText:     summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

/* ───────────────────────────────────── */

module.exports = { showPriceList, handleInteraction };
