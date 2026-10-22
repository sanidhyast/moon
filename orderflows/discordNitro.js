const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require('discord.js');

const items   = require('../data/items');
const session = require('./sessionManager');
const { getDisabledItems, getEnabledItems } = require('../database/supabase');

const FLOW = 'ds';

/* ───────────────────────────────────── */

async function loadItems(category) {
  const g = 'discordNitro';
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

  const banner     = new AttachmentBuilder('./pricing.png', { name: 'pricing.png' });
  const [nitro, sb1mo, sb3mo, decoration, accountSale] = await Promise.all([
    loadItems('nitro_boost'),
    loadItems('server_boost_1mo'),
    loadItems('server_boost_3mo'),
    loadItems('decoration'),
    loadItems('account_sale'),
  ]);

  const embed = new EmbedBuilder()
    .setTitle('💜 Discord Services – Price List')
    .setColor(0x5865F2)
    .setDescription(
`**Nitr0 B00st — (VILOG)**
${nitro.map(i => i.label).join('\n') || '*Currently unavailable*'}

**Server Boost — Durasi 1 Bulan**
${sb1mo.map(i => i.label).join('\n') || '*Currently unavailable*'}

**Server Boost — Durasi 3 Bulan**
${sb3mo.map(i => i.label).join('\n') || '*Currently unavailable*'}

**Decoration**
Harga Resmi > Harga Store
${decoration.map(i => i.label).join('\n') || '*Currently unavailable*'}

**Account For Sale**
${accountSale.map(i => i.label).join('\n') || '*Currently unavailable*'}
> ➢ Limited stock jadi tanya dulu yaa!
> ➢ Take se email-emailnya
> ➢ Full Warranty
`
    )
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ds_order')
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

  /* ── Order clicked → choose service type ── */
  if (id === 'ds_order') {
    session.setSession(userId, { flow: FLOW, step: 1 });
    return showTypeSelect(interaction);
  }

  /* ── Service type selected ── */
  if (id === 'ds_type_select') {
    const type = interaction.values[0]; // nitro_boost | server_boost | decoration
    session.updateSession(userId, { step: 2, serviceType: type });
    return showLoginConfirm(interaction);
  }

  /* ── Login confirmation ── */
  if (id === 'ds_login_yes') {
    const s = session.getSession(userId);

    if (s.serviceType === 'server_boost') {
      session.updateSession(userId, { step: 3 });
      return showDurationSelect(interaction);
    }

    session.updateSession(userId, { step: 4 });
    return showPackageSelect(interaction);
  }

  if (id === 'ds_login_no') {
    session.deleteSession(userId);
    return interaction.update({
      content: '❌ Order cancelled. Silakan pelajari dulu proses pengerjaan via login.',
      embeds: [],
      components: []
    });
  }

  /* ── Duration selected (server boost only) ── */
  if (id === 'ds_duration_select') {
    const duration = interaction.values[0]; // 1mo | 3mo
    session.updateSession(userId, { step: 4, duration });
    return showPackageSelect(interaction);
  }

  /* ── Package selected ── */
  if (id === 'ds_package_select') {
    const selected = interaction.values[0];
    const s        = session.getSession(userId);

    const category  = resolvePackageCategory(s);
    const allItems  = await loadItems(category);
    const item      = allItems.find(i => i.value === selected);

    session.updateSession(userId, {
      step:    5,
      package: item?.label ?? selected
    });

    return showSummary(interaction);
  }

  if (id === 'ds_create_ticket') return createTicket(interaction);

  if (id === 'ds_cancel') {
    session.deleteSession(userId);
    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: []
    });
  }
}

/* ───────────────────────────────────── */
/*  Helper – figure out which item category to load for packages          */
function resolvePackageCategory(s) {
  if (s.serviceType === 'nitro_boost')  return 'nitro_boost';
  if (s.serviceType === 'decoration')   return 'decoration';
  if (s.serviceType === 'account_sale') return 'account_sale';
  if (s.serviceType === 'server_boost') {
    return s.duration === '3mo' ? 'server_boost_3mo' : 'server_boost_1mo';
  }
  return s.serviceType;
}

/* ───────────────────────────────────── */

async function showTypeSelect(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('💜 Pilih Layanan Discord')
    .setColor(0x5865F2)
    .setDescription('Pilih jenis layanan yang ingin dipesan:');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ds_type_select')
    .setPlaceholder('Pilih layanan...')
    .addOptions(items.discordNitro.categories);

  return interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true
  });
}

/* ───────────────────────────────────── */

async function showLoginConfirm(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Mohon di baca dan pahami ⚠️')
    .setColor(0x5865F2)
    .setDescription(
      '**Pengerjaan via login, apakah kamu sudah mengerti?**\n\n' +
      '> Proses pengerjaan memerlukan akses login ke akun Discord kamu.\n' +
      '> Pastikan kamu memahami risiko dan prosedurnya sebelum melanjutkan.'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ds_login_yes')
      .setLabel('✅ Ya, Sudah Mengerti')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('ds_login_no')
      .setLabel('❌ Tidak')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({ embeds: [embed], components: [row] });
}

/* ───────────────────────────────────── */

async function showDurationSelect(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🚀 Pilih Durasi Server Boost')
    .setColor(0x5865F2)
    .setDescription('Pilih durasi yang diinginkan:');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ds_duration_select')
    .setPlaceholder('Pilih durasi...')
    .addOptions([
      { label: '📅 1 Bulan', value: '1mo' },
      { label: '📅 3 Bulan', value: '3mo' }
    ]);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

/* ───────────────────────────────────── */

async function showPackageSelect(interaction) {
  const s        = session.getSession(interaction.user.id);
  const category = resolvePackageCategory(s);
  const available = await loadItems(category);

  if (available.length === 0) {
    return interaction.update({
      content: '⚠️ No packages are currently available in this category.',
      embeds: [],
      components: []
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Pilih Paket')
    .setColor(0xFEE75C)
    .setDescription('Pilih paket yang ingin dipesan:');

  const select = new StringSelectMenuBuilder()
    .setCustomId('ds_package_select')
    .setPlaceholder('Pilih paket...')
    .addOptions(available);

  return interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)]
  });
}

/* ───────────────────────────────────── */

async function showSummary(interaction) {
  const s = session.getSession(interaction.user.id);

  const typeLabel = {
    nitro_boost:  '🔵 Nitro Boost',
    server_boost: '🚀 Server Boost',
    decoration:   '🎨 Decoration',
    account_sale: '📋 Account For Sale',
  }[s.serviceType] ?? s.serviceType;

  const durationLabel = s.duration
    ? (s.duration === '1mo' ? ' (1 Bulan)' : ' (3 Bulan)')
    : '';

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📋 **Produk:** Discord Services\n` +
      `💜 **Layanan:** ${typeLabel}${durationLabel}\n` +
      `📦 **Paket:** ${s.package}`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ds_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),

    new ButtonBuilder()
      .setCustomId('ds_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.update({ embeds: [embed], components: [row] });
}

/* ───────────────────────────────────── */

async function createTicket(interaction) {
  const { createTicket: openTicket } = require('../tickets/createTicket');
  const s = session.getSession(interaction.user.id);

  const typeLabel = {
    nitro_boost:  '🔵 Nitro Boost',
    server_boost: '🚀 Server Boost',
    decoration:   '🎨 Decoration',
    account_sale: '📋 Account For Sale',
  }[s.serviceType] ?? s.serviceType;

  const durationLabel = s.duration
    ? (s.duration === '1mo' ? ' (1 Bulan)' : ' (3 Bulan)')
    : '';

  const summary =
`**📋 Produk:** Discord Services
**💜 Layanan:** ${typeLabel}${durationLabel}
**📦 Paket:** ${s.package}`;

  const instruction =
`📌 **Instruksi:**
• Pengerjaan dilakukan via login akun Discord kamu
• Mohon standby dan siap memberikan kode verifikasi jika diperlukan
• Proses dilakukan sesuai antrian (jika mengantri)
• Selesaikan pembayaran sesuai arahan admin
• Setelah selesai, tiket akan ditutup oleh admin`;

  await openTicket(interaction, {
    orderType:       'Discord Services',
    categoryKey:     'discordServices',
    summaryText:     summary,
    instructionText: instruction
  });

  session.deleteSession(interaction.user.id);
}

/* ───────────────────────────────────── */

module.exports = { showPriceList, handleInteraction };
