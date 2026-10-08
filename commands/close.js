const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const { disableButton, getDisabledButtons, getRemovedButtons } = require('../database/supabase');
const { buildPanelRows } = require('../utils/panelRows');
const { handleClose } = require('../tickets/closeTicket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close current ticket or disable a panel button')
    .addStringOption(opt =>
      opt.setName('button')
        .setDescription('Select button to disable (leave empty to close this ticket)')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const btn = interaction.options.getString('button');

    // If no button is specified, handle closing current ticket
    if (!btn) {
      const channel = interaction.channel;
      const isTicket = channel?.topic?.includes('openedAt');
      if (!isTicket) {
        return interaction.reply({
          content: '❌ Please specify a button to disable, or use this command inside a ticket to close it.',
          flags: 64,
        });
      }
      return handleClose(interaction);
    }

    // Otherwise, disabling a panel button (requires Admin)
    await interaction.deferReply({ flags: 64 });

    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      || interaction.guild?.ownerId === interaction.user.id;

    if (!isAdmin) {
      return interaction.editReply({
        content: '❌ You are not allowed to use this command.',
      });
    }

    await disableButton(btn);

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
        console.error('[Panel Update Error in /close]', panelErr);
      }
    }

    await interaction.editReply({
      content: `❌ Disabled: **${btn}**`,
    });
  },
};
