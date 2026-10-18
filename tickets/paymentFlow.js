const fs = require('fs');
const path = require('path');

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const { createTranscript } = require('discord-html-transcripts');
const { buildRatingRow, buildTranscriptRow, getStorageChannel } = require('./testimonialFlow');
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
  if (interaction.member?.permissions?.has(1n << 3n)) return true; // Administrator
  if (interaction.guild?.ownerId === userId) return true;
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
  const ticketMeta = getTicketMeta(interaction.channel);

  if (!isAuthorizedAdmin(interaction)) {
    return interaction.reply({
      content: '❌ Only Moon or an authorized admin can mark orders as done.',
      flags: 64,
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
  const reviewFiles = [];

  if (fs.existsSync(reviewPath)) {
    reviewFiles.push(
      new AttachmentBuilder(reviewPath, {
        name: 'review.jpg',
      })
    );
  }

  const testimonialChannelId = config.testimonialChannelId || '1436690762866753536';

  const reviewEmbed = new EmbedBuilder()
    .setColor(0xE6D5FF)
    .setDescription(
      '**✨ PESANAN MU SUDAH TERKIRIM, TERIMAKASIH SUDAH BERBELANJA DI MOONBLOX✨**\n\n' +
      `Apabila kalian merasa puas dengan pelayanan kami, bisa dukung kami dengan mengisi testimoni di <#${testimonialChannelId}> dan memberi rating 5⭐ di ticket!\n\n` +
      '*Ticket akan ditutup beberapa saat lagi.*'
    );

  if (reviewFiles.length > 0) {
    reviewEmbed.setImage('attachment://review.jpg');
  }

  // ── Close Ticket Button below this message ────────────────
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );

  await interaction.channel.send({
    content: ticketMeta.userId ? `<@${ticketMeta.userId}>` : undefined,
    embeds: [reviewEmbed],
    files: reviewFiles,
    components: [closeRow],
    allowedMentions: ticketMeta.userId ? { users: [ticketMeta.userId] } : undefined,
  });

  // ── DM order completed message to customer ────────────────
  if (ticketMeta.userId) {
    try {
      const customer = await interaction.client.users.fetch(ticketMeta.userId).catch(() => null);
      if (customer) {
        // Generate transcript
        let transcriptAttachment = null;
        try {
          transcriptAttachment = await createTranscript(interaction.channel, {
            limit: -1,
            returnType: 'attachment',
            filename: `transcript-${interaction.channel.name}.html`,
            saveImages: false,
            poweredBy: false,
          });
        } catch (transErr) {
          console.error('[handleOrderDone Transcript Error]', transErr);
        }

        // Upload transcript to hidden storage channel to obtain CDN URL
        let transcriptUrl = null;
        if (transcriptAttachment) {
          try {
            const guild = interaction.guild;
            const storageChannel = await getStorageChannel(guild);
            if (storageChannel) {
              const storedMsg = await storageChannel.send({
                content: `📁 Order Done Transcript for #${interaction.channel.name} (<@${customer.id}>)`,
                files: [transcriptAttachment],
              });
              transcriptUrl = storedMsg.attachments.first()?.url || null;
            }
          } catch (logErr) {
            console.error('[handleOrderDone Storage Error]', logErr);
          }
        }

        // Send clean embed + button to admin log channel (NO file attached -> no code preview)
        if (config.transcriptLogChannelId) {
          try {
            const guild = interaction.guild;
            const logChannel = guild?.channels?.cache?.get(config.transcriptLogChannelId)
              || await guild?.channels?.fetch(config.transcriptLogChannelId).catch(() => null);
            if (logChannel) {
              const doneLogEmbed = new EmbedBuilder()
                .setTitle('📦 Order Done Transcript')
                .setColor(0x57F287)
                .addFields(
                  { name: 'Ticket', value: interaction.channel.name, inline: true },
                  { name: 'Customer', value: `<@${customer.id}> (${customer.tag})`, inline: true },
                  { name: 'Staff', value: interaction.user.tag, inline: true },
                )
                .setTimestamp();

              const logComponents = [];
              if (transcriptUrl) {
                logComponents.push(buildTranscriptRow(transcriptUrl));
              }

              // NO files attached here -> completely eliminates the code preview box!
              await logChannel.send({
                embeds: [doneLogEmbed],
                components: logComponents,
              });
            }
          } catch (logErr) {
            console.error('[handleOrderDone Log Error]', logErr);
          }
        }

        // Extract order summary
        let orderSummary = ticketMeta.summary || '';
        if (!orderSummary) {
          try {
            const msgs = await interaction.channel.messages.fetch({ limit: 15 }).catch(() => null);
            if (msgs) {
              const welcomeMsg = msgs.find(m => m.embeds?.[0]?.description?.includes('Ringkasan Pesanan'));
              if (welcomeMsg) {
                const desc = welcomeMsg.embeds[0].description || '';
                const match = desc.match(/\*\*🛍️ Ringkasan Pesanan:\*\*\n([\s\S]*?)(?:\n\n📌|$)/);
                if (match) orderSummary = match[1].trim();
              }
            }
          } catch {}
        }

        const dmComponents = [buildRatingRow()];
        if (transcriptUrl) {
          dmComponents.push(buildTranscriptRow(transcriptUrl));
        }

        const transcriptNote = transcriptUrl
          ? `*Klik tombol **View Transcript** di bawah sebagai bukti percakapan tiket.*`
          : `*File transcript tiket terlampir di bawah sebagai bukti transaksi kamu.*`;

        const dmEmbed = new EmbedBuilder()
          .setTitle('✨ Pesanan Selesai - MoonBlox ✨')
          .setColor(0x57F287)
          .setDescription(
            `Halo <@${customer.id}>! Terimakasih sudah berbelanja di **MoonBlox** 🌙✨\n\n` +
            (ticketMeta.orderType ? `📦 **Layanan:** ${ticketMeta.orderType}\n` : '') +
            (orderSummary ? `\n**🛍️ Ringkasan Pesanan:**\n${orderSummary}\n` : '') +
            `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⭐ **Beri Rating & Testimoni:**\n` +
            `Pilih bintang di bawah untuk menilai pelayanan kami. Khusus rating **5⭐**, testimonimu akan otomatis diposting ke <#${testimonialChannelId}>!\n\n` +
            transcriptNote
          )
          .setFooter({ text: 'MoonBlox • Terimakasih telah berbelanja!' })
          .setTimestamp();

        // If transcriptUrl is available, omit file attachment to avoid the raw HTML code preview box in DM
        const dmFiles = transcriptUrl ? [] : (transcriptAttachment ? [transcriptAttachment] : []);

        await customer.send({
          embeds: [dmEmbed],
          files: dmFiles,
          components: dmComponents,
        }).then(() => {
          console.log(`[Customer DM] Order completed message sent to ${customer.tag} (${customer.id})`);
        }).catch(err => {
          console.warn(`[Customer DM] Failed to DM ${customer.tag} (${customer.id}):`, err.message || err);
        });

        // Mark that DM has been sent in channel topic
        try {
          const currentMeta = getTicketMeta(interaction.channel);
          await interaction.channel.setTopic(JSON.stringify({ ...currentMeta, dmSent: true }));
        } catch {}
      }
    } catch (dmErr) {
      console.error('[handleOrderDone Customer DM Error]', dmErr);
    }
  }
}
module.exports = {
  sendPaymentInstructions,
  handlePaymentDone,
  handlePaymentVerify,
  handleOrderDone,
};
