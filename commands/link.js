const path = require('path');
const fs = require('fs');
const { getDisabledButtons, getRemovedButtons } = require('../database/supabase');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const { buildPanelRows } = require('../utils/panelRows');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Deploy the MoonBlox Order Panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;

    if (!isAdmin) {
      return interaction.editReply({
        content: '❌ You are not allowed to use this command.',
      });
    }

    const [disabled, removed] = await Promise.all([
      getDisabledButtons(),
      getRemovedButtons(),
    ]);

    const bannerPath = path.join(__dirname, '..', 'pricing.png');
    const files = fs.existsSync(bannerPath)
      ? [new AttachmentBuilder(bannerPath, { name: 'pricing.png' })]
      : [];

    const purchaseEmbed = new EmbedBuilder()
      .setTitle('🛒 MoonBlox Pricelist')
      .setColor(0x2ecc71)
      .setDescription(`
Di sini kamu dapat melihat berbagai layanan yang tersedia di Moonblox beserta pricelist lengkapnya.

Silakan klik menu yang kamu inginkan di bawah 👇📜 untuk melihat harga serta detail produk yang tersedia.

🔒 Informasi harga yang kamu buka melalui menu hanya akan terlihat oleh kamu saja.

Setelah menemukan produk yang kamu butuhkan, kamu bisa langsung membuka ticket sesuai kategori 🎫.

💎 Tim Moonblox siap membantu dan memberikan pelayanan terbaik. 🌙✨
`)
      .setFooter({ text: 'MoonBlox Store' });

    if (files.length > 0) {
      purchaseEmbed.setImage('attachment://pricing.png');
    }

    const msg = await interaction.channel.send({
      embeds: [purchaseEmbed],
      components: buildPanelRows(disabled, removed),
      files: files,
    });

    global.panelData = {
      channelId: msg.channel.id,
      messageId: msg.id,
    };

    await interaction.editReply({
      content: '✅ Purchase panel deployed!',
    });
  },
};
