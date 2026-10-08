const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const { enableButton, getDisabledButtons, getRemovedButtons } = require('../database/supabase');
const { buildPanelRows } = require('../utils/panelRows');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Enable a panel button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('button')
        .setDescription('Select button')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;

    if (!isAdmin) {
      return interaction.editReply({
        content: '❌ You are not allowed to use this command.',
      });
    }

    const btn = interaction.options.getString('button');

    await enableButton(btn);

    const panel = global.panelData;

    if (panel) {
      try {
        const channel = await interaction.client.channels.fetch(panel.channelId).catch(() => null);
        if (channel) {
          const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
          if (msg) {
            const [disabled, removed] = await Promise.all([
              getDisabledButtons(),
              getRemovedButtons(),
            ]);
            await msg.edit({
              components: buildPanelRows(disabled, removed),
            });
          }
        }
      } catch (panelErr) {
        console.error('[Panel Update Error in /open]', panelErr);
      }
    }

    await interaction.editReply({
      content: `✅ Enabled: **${btn}**`,
    });
  },
};
