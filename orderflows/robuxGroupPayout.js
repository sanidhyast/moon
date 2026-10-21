const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');

const session = require('./sessionManager');

const FLOW = 'rgp';

const RATES = {
  1: 130,
  2: 135,
  3: 125,
};

const GROUP_CONFIGS = {
  1: {
    rate: 130,
    title: '🌙 Robuk Via Group payout r130 – Price List',
    name: 'Group Payout R130 Min 10krbx',
    requirements: [
      '- Wajib berada di group minimal 2 minggu',
      '- Robux masuk instant tanpa delay (jika sudah 2 minggu di group)',
      '- Pembelian minimum 10k robux no maximum.',
      '- Jika robux belum masuk mohon check ke transaction dan cek robux pending ( tidak tentu tergantung account )',
    ],
  },
  2: {
    rate: 135,
    title: '🌙 Robuk Via Group payout r135 – Price List',
    name: 'Group Payout R135 ( min 1rbx - max 9999rbx )',
    requirements: [
      '- Wajib berada di group minimal 2 minggu',
      '- Robux masuk instant tanpa delay (jika sudah 2 minggu di group)',
      '- Pembelian no minimum , max 9999rbx',
      '- Jika robux belum masuk mohon check ke transaction dan cek robux pending ( tidak tentu tergantung account )',
    ],
  },
  3: {
    rate: 125,
    title: '🌙 Robuk Via Group payout r125 – Price List',
    name: 'Group Payout Promo R125 min 5krbx',
    requirements: [
      '- Wajib berada di group minimal 2 minggu',
      '- Robux masuk instant tanpa delay (jika sudah 2 minggu di group)',
      '- Pembelian minimum 5k robux no maximum.',
      '- Penawaran terbatas jika ada announcement promo only.',
      '- Jika robux belum masuk mohon check ke transaction dan cek robux pending ( tidak tentu tergantung account )',
    ],
  },
};

function formatIDR(amount) {
  return Math.round(amount).toLocaleString('id-ID');
}

async function showPriceList(interaction, groupNum) {
  await interaction.deferReply({ flags: 64 });

  const cfg = GROUP_CONFIGS[groupNum] || {
    rate: RATES[groupNum] || 120,
    title: `🌙 Robuk Via Group payout ${groupNum} – Price List`,
    name: `Group Payout ${groupNum}`,
    requirements: [
      '- Wajib berada di group minimal 2 minggu',
      '- Robux masuk instant tanpa delay (jika sudah 2 minggu di group)',
    ],
  };

  const rate = cfg.rate;
  const bannerPath = path.join(__dirname, '..', 'pricing.png');
  const banner = new AttachmentBuilder(bannerPath, { name: 'pricing.png' });

  const embed = new EmbedBuilder()
    .setTitle(cfg.title)
    .setColor(0x57F287)
    .setDescription(`
⏣ **100 Rbx** - ${formatIDR(100 * rate)} 💰
⏣ **500 Rbx** - ${formatIDR(500 * rate)} 💰
⏣ **1.000 Rbx** - ${formatIDR(1000 * rate)} 💰
⏣ **10.000 Rbx** - ${formatIDR(10000 * rate)} 💰
**Rate:** ${rate} / ⏣1

📌 **Requirements**
${cfg.requirements.join('\n')}

🔗 Join group:
Group 1
https://www.roblox.com/share/g/634467947
Group 2
https://www.roblox.com/share/g/522885194
Group 3
https://www.roblox.com/share/g/438664165
Group 4
https://www.roblox.com/share/g/959865
Group 5
https://www.roblox.com/share/g/975223
Group 6
https://www.roblox.com/share/g/926136

Cara membeli :
✅Check ketersediaan akun di https://discord.com/channels/1435168751158038700/1435168759039000708 , ketik \`/payout\` username
🚫Jika belum 2 minggu/not eligible silahkan tunggu sampai akun bisa di kirim payout.
✅Robux via group payout bersikap fleksible , bisa berapapun robux nya sesuai yang kalian inginkan (tidak terpaku pada pricelist)
`)
    .setImage('attachment://pricing.png')
    .setFooter({ text: 'MoonBlox • Click Order to proceed' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rgp_order_po_${groupNum}`)
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

async function handleInteraction(interaction) {
  const id = interaction.customId;
  const userId = interaction.user.id;

  if (id.startsWith('rgp_order_po_')) {
    const groupNum = id.replace('rgp_order_po_', '');
    session.setSession(userId, { flow: FLOW, step: 1, category: groupNum });
    return showModal(interaction, groupNum);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'rgp_modal') {
    const username = interaction.fields.getTextInputValue('rgp_username');
    const amount = interaction.fields.getTextInputValue('rgp_amount');

    session.updateSession(userId, {
      step: 2,
      username,
      amount,
    });

    return showSummary(interaction);
  }

  if (id === 'rgp_create_ticket') return createTicket(interaction);

  if (id === 'rgp_cancel') {
    session.deleteSession(userId);

    return interaction.update({
      content: '❌ Order cancelled.',
      embeds: [],
      components: [],
    });
  }
}

async function showModal(interaction, category) {
  const cfg = GROUP_CONFIGS[category];
  const modalTitle = cfg ? `⚡ ${cfg.name}`.slice(0, 45) : `⚡ Robuk Via Group payout ${category}`;

  const modal = new ModalBuilder()
    .setCustomId('rgp_modal')
    .setTitle(modalTitle);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rgp_username')
        .setLabel('👤 Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('rgp_amount')
        .setLabel('💰Jumlah Robux:')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 1000')
    )
  );

  await interaction.showModal(modal);
}

async function showSummary(interaction) {
  const s = session.getSession(interaction.user.id);
  const cfg = GROUP_CONFIGS[s.category];
  const rate = cfg?.rate || RATES[s.category] || 120;
  const total = Number(s.amount) * rate;
  const productName = cfg?.name || `Robuk Via Group payout ${s.category}`;

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Detail Pembelian 🛍️')
    .setColor(0x5865F2)
    .setDescription(
      `📄 **Produk:** ⚡ ${productName}\n` +
      `👤 **Username:** ${s.username}\n` +
      `💰 **Jumlah Robux:** ${s.amount}\n` +
      `📊 **Rate:** ${rate} / ⏣1\n` +
      `💵 **Total:** ${formatIDR(total)} 💰`
    )
    .setFooter({
      text: '⚠️ Pastikan sudah di dalam group community selama 2+ minggu!'
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rgp_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎫'),
    new ButtonBuilder()
      .setCustomId('rgp_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 64,
  });
}

async function createTicket(interaction) {
  const { createTicket: openTicket } = require('../tickets/createTicket');

  const s = session.getSession(interaction.user.id);
  const cfg = GROUP_CONFIGS[s.category];
  const rate = cfg?.rate || RATES[s.category] || 120;
  const total = Number(s.amount) * rate;
  const productName = cfg?.name || `Robuk Via Group payout ${s.category}`;

  const summary = `
**📋Produk:** ${productName}
**👤Username:** ${s.username}
**💰Jumlah Robux:** ${s.amount} Robux
**📊Rate:** ${rate} / ⏣1
**💵Total:** ${formatIDR(total)} 💰
`;
  const instruction =
  `📌 **Instruksi:**
• Robux via Group payout instant tanpa delay.
• Pastikan sudah 2 minggu di dalam group
• Selesaikan pembayaran sesuai arahan admin.
• Pastikan username Roblox kamu sudah benar sebelum admin memproses.
• Setelah selesai, tiket akan ditutup oleh admin.`;

  await openTicket(interaction, {
    orderType: productName,
    categoryKey: 'robuxGroupPayout',
    summaryText: summary,
    instructionText: instruction,
  });

  session.deleteSession(interaction.user.id);
}

module.exports = {
  showPriceList,
  handleInteraction,
};
