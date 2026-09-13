const fs = require('fs');
const path = require('path');

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const config = require('../config');

function getTicketMeta(channel) {
  try {
    return JSON.parse(channel.topic || '{}');
  } catch {
    return {};
  }
}
function isAuthorizedAdmin(interaction) {
  const userId = interaction.user.id;
  if (userId === config.ownerUserId) return true;
  if (config.adminUserIds.includes(userId)) return true;
  if (config.adminRoleId && interaction.member?.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}

function getPaymentQrPath() {
  const configuredPath = config.paymentQrImagePath || 'payment-qr.png';

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
}

async function sendPaymentInstructions(channel, user) {
  const paymentEmbed = new EmbedBuilder()
    .setTitle('💳 Payment Information')
    .setColor(0x5865F2)
    .setDescription(
`**Bank Transfer**
BCA 7425163001 AN Revina A

**E-Wallet**
Dana - 085283960141 AN Yani M.

**FEE QRIS**
💵 0 - 500.000 = Rp.500
💵 500.001 - 1.000.000 = Rp.2000
💵 1.000.001 - 5.000.000 = 5% dari transaksi
💵 5.000.001 - seterusnya = 7% dari transaksi

**FEE QRIS WAJIB DI BAYAR**`
    );

  await channel.send({ embeds: [paymentEmbed] });

  const qrPath = getPaymentQrPath();

  if (fs.existsSync(qrPath)) {
    await channel.send({
      files: [new AttachmentBuilder(qrPath)],
    });
  } else {
    console.warn(`[paymentFlow] QR image not found at ${qrPath}`);
  }

  const paymentDoneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('payment_done')
      .setLabel('Sudah transfer')
      .setStyle(ButtonStyle.Success)
  );

  const paymentDoneEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('💰 Payment Pending')
      .setDescription(
        `Jika sudah transfer tolong click tombol di bawah ini `
      );
    
    await channel.send({
      content: `<@${user.id}>`, 
      embeds: [paymentDoneEmbed],
      components: [paymentDoneRow],
      allowedMentions: { users: [user.id] },
    });
}

async function handlePaymentDone(interaction) {
  const ticketMeta = getTicketMeta(interaction.channel);
  const ownerUserId = config.ownerUserId;

  if (!ticketMeta.userId || interaction.user.id !== ticketMeta.userId) {
    return interaction.reply({
      content: '❌ Only the ticket buyer can use this button.',
      ephemeral: true,
    });
  }

  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components[0].setDisabled(true);

  await interaction.update({
    components: [disabledRow],
  });

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('payment_verify')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Primary)
  );

  if (ownerUserId) {
    const verifyEmbed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setDescription(
        `Pembeli sudah mengirimkan pembayaran`
      );
    
    await interaction.channel.send({
      content: `<@${ownerUserId}>`,
      embeds: [verifyEmbed],
      components: [verifyRow],
      allowedMentions: { users: [ownerUserId] },
    });

    try {
      const ownerUser = await interaction.client.users.fetch(ownerUserId);
      const ticketUrl = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}`;

      await ownerUser.send(
        `Hey Moon, the Buyer has completed the payment in the ticket:\n${ticketUrl}`
      );
    } catch (error) {
      console.error('[paymentFlow] Failed to DM owner:', error);
    }
  } else {
    await interaction.channel.send({
      content: '⚠️ OWNER_USER_ID is not configured, so no owner was notified.',
    });
  }
}

async function handlePaymentVerify(interaction) {
  const ownerUserId = config.ownerUserId;
  const ticketMeta = getTicketMeta(interaction.channel);

  if (!isAuthorizedAdmin(interaction)) {
    return interaction.reply({
      content: '❌ Only Moon or an authorized admin can verify this payment.',
      ephemeral: true,
    });
}

  const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
  disabledRow.components[0].setDisabled(true);

  await interaction.update({
    components: [disabledRow],
  });

  if (ticketMeta.userId) {
    const successEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Pembayaran di terima')
      .setDescription(
        `Pembayaran mu telah kami terima!\n` +
        `Silahkan menunggu admin untuk memproses pesananmu ✨`
      );
    
    const doneRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('order_done')
        .setLabel('Done')
        .setStyle(ButtonStyle.Success)
    );
    
    await interaction.channel.send({
      content: `<@${ticketMeta.userId}>`,
      embeds: [successEmbed],
      components: [doneRow],
      allowedMentions: { users: [ticketMeta.userId] },
    });
  }
}
async function handleOrderDone(interaction) {
  const ownerUserId = config.ownerUserId;
  const ticketMeta = getTicketMeta(interaction.channel);

  if (!isAuthorizedAdmin(interaction)) {
    return interaction.reply({
      content: '❌ Only Moon or an authorized admin can mark orders as done.',
      ephemeral: true,
    });
}

  const disabledRow = ActionRowBuilder.from(
    interaction.message.components[0]
  );

  disabledRow.components[0].setDisabled(true);

  await interaction.update({
    components: [disabledRow],
  });

  const reviewPath = path.resolve(__dirname, '..', 'review.jpg');

  if (!fs.existsSync(reviewPath)) {
    return interaction.channel.send('⚠️ review.jpg not found.');
  }

  const reviewAttachment = new AttachmentBuilder(reviewPath, {
      name: 'review.jpg',
    });
    
    const reviewEmbed = new EmbedBuilder()
      .setColor(0xE6D5FF)
      .setImage('attachment://review.jpg')
      .setDescription(
        '**✨ PESANAN MU SUDAH TERKIRIM, TERIMAKASIH SUDAH BERBELANJA DI MOONBLOX✨**\n\n' +
        'Apabila kalian merasa puas dengan pelayanan kami, bisa dukung kami dengan mengisi testimoni di <#1436690762866753536> dan memberi rating 5⭐ di ticket!\n\n' +
        '*Ticket akan ditutup beberapa saat lagi.*'
      );
    
    await interaction.channel.send({
      content: `<@${ticketMeta.userId}>`,
      embeds: [reviewEmbed],
      files: [reviewAttachment],
      allowedMentions: { users: [ticketMeta.userId] },
    });
}
module.exports = {
  sendPaymentInstructions,
  handlePaymentDone,
  handlePaymentVerify,
  handleOrderDone,
};
