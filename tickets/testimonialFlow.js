const path = require('path');
const fs = require('fs');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');

const config = require('../config');

/**
 * Builds the 5-star rating button row for customer DMs
 */
function buildRatingRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rate_star_1')
      .setLabel('⭐ 1')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('rate_star_2')
      .setLabel('⭐ 2')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('rate_star_3')
      .setLabel('⭐ 3')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('rate_star_4')
      .setLabel('⭐ 4')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('rate_star_5')
      .setLabel('⭐⭐⭐⭐⭐ (5)')
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Builds the View Transcript link button row
 */
function buildTranscriptRow(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View Transcript')
      .setStyle(ButtonStyle.Link)
      .setURL(url)
      .setEmoji('📄')
  );
}

/**
 * Handles rating button clicks in customer DMs
 */
async function handleRatingButton(interaction) {
  const stars = interaction.customId.replace('rate_star_', '');

  if (stars === '5') {
    const modal = new ModalBuilder()
      .setCustomId('modal_rate_5')
      .setTitle('Testimoni MoonBlox (⭐⭐⭐⭐⭐)');

    const reviewInput = new TextInputBuilder()
      .setCustomId('review_text')
      .setLabel('Ulasan / Testimoni Kamu (Opsional):')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Contoh: Pelayanan super cepat, admin ramah dan terpercaya! Recommended seller ⭐⭐⭐⭐⭐')
      .setRequired(false);

    const row = new ActionRowBuilder().addComponents(reviewInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // If 1-4 stars: thank them privately
  await interaction.reply({
    content: `Terimakasih atas penilaian **${stars}⭐** kamu! Masukanmu sangat berharga bagi kami untuk terus meningkatkan kualitas pelayanan MoonBlox. 🙏✨`,
    flags: 64,
  }).catch(() => {});

  // Disable rating buttons after rating, keeping link buttons active
  if (interaction.message && interaction.message.components?.length > 0) {
    try {
      const updatedRows = interaction.message.components.map(row => {
        const actionRow = ActionRowBuilder.from(row);
        actionRow.components.forEach(c => {
          if (c.data.style !== ButtonStyle.Link) {
            c.setDisabled(true);
          }
        });
        return actionRow;
      });
      await interaction.message.edit({ components: updatedRows }).catch(() => {});
    } catch {}
  }
}

/**
 * Handles the 5-star modal submission and automatically sends chat/embed to #testimoni channel
 */
async function handleTestimonialModal(interaction, client) {
  const userReview = interaction.fields.getTextInputValue('review_text')?.trim();
  const reviewContent = userReview || 'Pelayanan sangat memuaskan, cepat, ramah, dan terpercaya! ⭐⭐⭐⭐⭐';

  const testimonialChannelId = config.testimonialChannelId || '1436690762866753536';
  let targetChannel = null;

  try {
    targetChannel = client.channels.cache.get(testimonialChannelId)
      || await client.channels.fetch(testimonialChannelId).catch(err => {
           console.error('[Fetch Testimonial Channel Error]', err.message || err);
           return null;
         });
  } catch (err) {
    console.error('[Testimonial Channel Fetch Error]', err);
  }

  if (targetChannel) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('✨ TESTIMONI PELANGGAN MOONBLOX ✨')
        .setColor(0xFEE75C)
        .setDescription(
          `👤 **Customer:** <@${interaction.user.id}>\n` +
          `⭐ **Rating:** ⭐⭐⭐⭐⭐ (5/5 Stars)\n\n` +
          `💬 **Ulasan:**\n*"${reviewContent}"*`
        )
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'MoonBlox Verified Customer • Terimakasih atas testimoninya! 🌙✨' })
        .setTimestamp();

      await targetChannel.send({
        content: `🎉 Testimoni baru dari <@${interaction.user.id}>! ⭐⭐⭐⭐⭐`,
        embeds: [embed],
      });

      console.log(`[Testimonial] Successfully posted 5-star review from ${interaction.user.tag} to #${targetChannel.name || testimonialChannelId}`);
    } catch (sendErr) {
      console.error('[Send Testimonial Error]', sendErr);
    }
  } else {
    console.warn(`[Testimonial] Testimonial channel (${testimonialChannelId}) could not be accessed.`);
  }

  // Reply in customer's DM
  await interaction.reply({
    content: `✅ **Terimakasih banyak!** Testimoni dan rating 5⭐ kamu telah berhasil dikirim ke <#${testimonialChannelId}>! Dukunganmu sangat berarti bagi kemajuan MoonBlox 🌙✨`,
    flags: 64,
  }).catch(() => {});

  // Disable rating buttons on the original DM message, keeping link buttons active
  if (interaction.message && interaction.message.components?.length > 0) {
    try {
      const updatedRows = interaction.message.components.map(row => {
        const actionRow = ActionRowBuilder.from(row);
        actionRow.components.forEach(c => {
          if (c.data.style !== ButtonStyle.Link) {
            c.setDisabled(true);
          }
        });
        return actionRow;
      });
      await interaction.message.edit({ components: updatedRows }).catch(() => {});
    } catch {}
  }
}

module.exports = {
  buildRatingRow,
  buildTranscriptRow,
  handleRatingButton,
  handleTestimonialModal,
};
