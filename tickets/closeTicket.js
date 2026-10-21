const path = require('path');
const fs = require('fs');
const {
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder
} = require('discord.js');

const { createTranscript } = require('discord-html-transcripts');
const { buildRatingRow, buildTranscriptRow, getStorageChannel } = require('./testimonialFlow');
const config = require('../config');
const { closeTicketRecord } = require('../database/supabase');

/**
 * STEP 1: Button Click → Show Modal
 */
async function handleClose(interaction) {
  const guild = interaction.guild;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);

  const allowedRoles = [
    config.adminRoleId,
    config.robuxAdminRoleId,
    config.robuxLoginRoleId,
    config.robuxGamepassRoleId,
    config.robuxPayoutRoleId,
    config.heartopiaAdminRoleId,
    config.gamesAdminRoleId,
    config.discordServicesRoleId,
    config.resellerRoleId,
  ].filter(Boolean);

  const isStaff = member?.roles?.cache?.some(role =>
    allowedRoles.includes(role.id)
  ) || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
    || guild?.ownerId === interaction.user.id;

  if (!isStaff) {
    return interaction.reply({
      content: '❌ Only staff members can close tickets.',
      flags: 64,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('close_ticket_modal')
    .setTitle('Close Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('close_reason')
    .setLabel('Reason for closing')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter the reason...')
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(reasonInput);

  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * STEP 2: Modal Submit → Close Ticket
 */
async function handleCloseModal(interaction) {
  if (interaction.customId !== 'close_ticket_modal') return;

  const channel = interaction.channel;
  const guild = interaction.guild;
  const reason = interaction.fields.getTextInputValue('close_reason');

  await interaction.reply({
    content: '🔒 Closing ticket and generating transcript...',
    flags: 64,
  }).catch(() => {});

  await executeCloseTicket({
    channel,
    guild,
    closedByUser: interaction.user,
    reason: reason || 'No reason provided',
    client: interaction.client,
    isCancelled: false,
  });
}

/**
 * Shared execution logic to close a ticket, generate transcripts, log, and delete channel.
 */
async function executeCloseTicket({ channel, guild, closedByUser, reason, client, isCancelled = false }) {
  // ── Get Open Time & Topic Data ───────────
  let openedAt = 'Unknown';
  let isCancelledTopic = false;
  try {
    const data = JSON.parse(channel.topic || '{}');
    if (data.openedAt) {
      openedAt = `<t:${Math.floor(new Date(data.openedAt).getTime() / 1000)}:F>`;
    }
    if (data.cancelled) {
      isCancelledTopic = true;
    }
  } catch {}

  const actuallyCancelled = isCancelled || isCancelledTopic;
  const closedAt = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const closedUserTag = closedByUser?.tag || closedByUser?.username || 'Unknown';

  const allowedRoles = [
    config.adminRoleId,
    config.robuxAdminRoleId,
    config.robuxLoginRoleId,
    config.robuxGamepassRoleId,
    config.robuxPayoutRoleId,
    config.heartopiaAdminRoleId,
    config.gamesAdminRoleId,
    config.discordServicesRoleId,
    config.resellerRoleId,
  ].filter(Boolean);

  // ── Count Messages ─────────────────────────
  let adminCount = 0;
  let userCount = 0;

  try {
    let lastId;
    let pageCount = 0;

    while (pageCount < 20) {
      pageCount++;
      const messages = await channel.messages.fetch({
        limit: 100,
        before: lastId,
      }).catch(err => {
        console.error('[Transcript Message Fetch Error]', err.message || err);
        return null;
      });

      if (!messages || messages.size === 0) break;

      for (const msg of messages.values()) {
        if (msg.author?.bot) continue;

        const targetMember = msg.member || guild.members.cache.get(msg.author.id);
        const isAdmin = targetMember
          ? allowedRoles.some(r => targetMember.roles?.cache?.has(r))
          : false;

        if (isAdmin) adminCount++;
        else userCount++;
      }

      lastId = messages.last().id;
      if (messages.size < 100) break;
    }
  } catch (countErr) {
    console.error('[Message Counting Error]', countErr);
  }

  // ── Generate transcript ─────────────────────────
  let transcriptAttachment = null;
  try {
    transcriptAttachment = await createTranscript(channel, {
      limit: -1,
      returnType: 'attachment',
      filename: `transcript-${channel.name}.html`,
      saveImages: false,
      poweredBy: false,
    });
  } catch (err) {
    console.error('[Transcript Error]', err);
    transcriptAttachment = null;
  }

  // ── Upload transcript to hidden storage channel ─────────────────
  let transcriptUrl = null;
  if (transcriptAttachment) {
    try {
      const storageChannel = await getStorageChannel(guild);
      if (storageChannel) {
        const storedMsg = await storageChannel.send({
          content: `📁 Transcript for #${channel.name} (Closed by ${closedUserTag})`,
          files: [transcriptAttachment],
        });
        transcriptUrl = storedMsg.attachments.first()?.url || null;
      }
    } catch (storeErr) {
      console.error('[Transcript Storage Upload Error]', storeErr);
    }
  }

  // ── Send transcript to ADMIN log channel ───────────────
  if (!config.transcriptLogChannelId) {
    console.warn('[Transcript Log] TRANSCRIPT_LOG_CHANNEL_ID is not configured in .env');
  } else {
    try {
      const logChannel = guild.channels.cache.get(config.transcriptLogChannelId)
        || await guild.channels.fetch(config.transcriptLogChannelId).catch(err => {
             console.error(`[Transcript Log] Failed to fetch admin log channel (${config.transcriptLogChannelId}):`, err.message || err);
             return null;
           });

      if (!logChannel) {
        console.error(`[Transcript Log] Admin log channel (${config.transcriptLogChannelId}) not found in guild.`);
      } else {
        const logEmbed = new EmbedBuilder()
          .setTitle(actuallyCancelled ? '❌ Ticket Cancelled' : '📁 Ticket Transcript')
          .setColor(0xED4245)
          .addFields(
            { name: 'Ticket', value: channel.name, inline: true },
            { name: 'Closed by', value: closedUserTag, inline: true },
            { name: 'Reason', value: reason || (actuallyCancelled ? 'Payment cancelled' : 'No reason provided') },
            { name: '📅 Opened At', value: openedAt },
            { name: '📅 Closed At', value: closedAt },
            { name: '👨‍💼 Admin Messages', value: `${adminCount}`, inline: true },
            { name: '👤 User Messages', value: `${userCount}`, inline: true },
          )
          .setTimestamp();

        const logComponents = [];
        if (transcriptUrl) {
          logComponents.push(buildTranscriptRow(transcriptUrl));
        }

        // NO files attached here -> completely eliminates the code preview box!
        await logChannel.send({
          embeds: [logEmbed],
          components: logComponents,
        });
        console.log(`[Transcript Log] Successfully sent ticket transcript embed for #${channel.name} to admin channel.`);
      }
    } catch (err) {
      console.error('[Transcript Log Error]', err);
    }
  }

  // ── Send to PUBLIC transcript channel (Embed only) ───────────────
  if (!config.publicTranscriptChannelId) {
    console.warn('[Public Transcript] PUBLIC_TRANSCRIPT_CHANNEL_ID is not configured in .env');
  } else {
    try {
      const publicChannel = guild.channels.cache.get(config.publicTranscriptChannelId)
        || await guild.channels.fetch(config.publicTranscriptChannelId).catch(err => {
             console.error(`[Public Transcript] Failed to fetch public channel (${config.publicTranscriptChannelId}):`, err.message || err);
             return null;
           });

      if (!publicChannel) {
        console.error(`[Public Transcript] Public transcript channel (${config.publicTranscriptChannelId}) not found in guild.`);
      } else {
        const logoPath = path.join(__dirname, '..', 'logo.png');
        const hasLogo = fs.existsSync(logoPath);
        const publicFiles = hasLogo ? [new AttachmentBuilder(logoPath, { name: 'logo.png' })] : [];

        const publicEmbed = new EmbedBuilder()
          .setTitle(actuallyCancelled ? '❌ Ticket Cancelled' : '📁 Ticket Transcript')
          .setColor(0xFEE75C)
          .addFields(
            { name: 'Ticket', value: channel.name, inline: true },
            { name: 'Closed by', value: closedUserTag, inline: true },
            { name: 'Reason', value: reason || (actuallyCancelled ? 'Payment cancelled' : 'No reason provided') },
            { name: '📅 Opened At', value: openedAt },
            { name: '📅 Closed At', value: closedAt },
            { name: '👨‍💼 Admin Messages', value: `${adminCount}`, inline: true },
            { name: '👤 User Messages', value: `${userCount}`, inline: true },
          )
          .setTimestamp();

        if (hasLogo) {
          publicEmbed.setThumbnail('attachment://logo.png');
        }

        await publicChannel.send({
          embeds: [publicEmbed],
          files: publicFiles,
        });
        console.log(`[Public Transcript] Successfully sent ticket transcript embed for #${channel.name} to public channel.`);
      }
    } catch (err) {
      console.error('[Public Transcript Error]', err);
    }
  }

  // ── Send order completed / closed transcript to customer (DM) (only if not cancelled) ───
  if (!actuallyCancelled) {
    try {
      const data = JSON.parse(channel.topic || '{}');
      if (data.userId && !data.dmSent) {
        const targetClient = client || channel.client;
        const customer = await targetClient.users.fetch(data.userId).catch(() => null);
        if (customer) {
          const testimonialChannelId = config.testimonialChannelId || '1436690762866753536';
          let orderSummary = data.summary || '';
          if (!orderSummary) {
            try {
              const msgs = await channel.messages.fetch({ limit: 15 }).catch(() => null);
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
              (data.orderType ? `📦 **Layanan:** ${data.orderType}\n` : '') +
              (orderSummary ? `\n**🛍️ Ringkasan Pesanan:**\n${orderSummary}\n` : '') +
              `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
              `⭐ **Beri Rating & Testimoni:**\n` +
              `Pilih bintang di bawah untuk menilai pelayanan kami. Khusus rating **5⭐**, testimonimu akan otomatis diposting ke <#${testimonialChannelId}>!\n\n` +
              transcriptNote
            )
            .setFooter({ text: 'MoonBlox • Terimakasih telah berbelanja!' })
            .setTimestamp();

          await customer.send({
            embeds: [dmEmbed],
            components: dmComponents,
          }).then(() => {
            console.log(`[Customer DM] Order completed message sent to ${customer.tag} (${customer.id})`);
          }).catch(err => {
            console.warn(`[Customer DM] Failed to DM ${customer.tag} (${customer.id}):`, err.message || err);
          });
        }
      }
    } catch (dmErr) {
      console.error('[Close Ticket DM Error]', dmErr);
    }
  }

  // ── Update database ──────────────────────────────
  try {
    await closeTicketRecord(channel.id);
  } catch (err) {
    console.error('[Supabase Close Error]', err);
  }

  // ── Lock customer access ─────────────────────────
  try {
    for (const [id, overwrite] of channel.permissionOverwrites.cache) {
      const target = await guild.members.fetch(id).catch(() => null);
      if (!target) continue;

      const isStaffOrAdmin = allowedRoles.some(roleId => target.roles.cache.has(roleId))
        || target.permissions.has(PermissionFlagsBits.Administrator);

      if (
        overwrite.allow.has(PermissionFlagsBits.ViewChannel) &&
        !isStaffOrAdmin
      ) {
        await channel.permissionOverwrites.edit(id, {
          SendMessages: false,
          ViewChannel: false,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Lock Customer Access Error]', err);
  }

  // ── Closed embed ─────────────────────────────────
  try {
    const closedEmbed = new EmbedBuilder()
      .setTitle(actuallyCancelled ? '❌ Ticket Cancelled & Closed' : '🔒 Ticket Closed')
      .setColor(0xED4245)
      .setDescription(
        `This ticket was closed by **${closedUserTag}**.\nReason: **${reason}**\n\nDeleting channel in **5 seconds**...`
      )
      .setTimestamp();

    await channel.send({ embeds: [closedEmbed] });
  } catch (err) {
    console.error('[Closed Embed Error]', err);
  }

  // ── Delete channel ───────────────────────────────
  setTimeout(async () => {
    try {
      await channel.delete(`Ticket closed by ${closedUserTag}`);
    } catch (err) {
      console.error('[Channel Delete Error]', err);
    }
  }, 5000);
}

module.exports = {
  handleClose,
  handleCloseModal,
  executeCloseTicket,
};
