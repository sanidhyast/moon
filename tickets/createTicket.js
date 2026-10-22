const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config');
const { createTicketRecord } = require('../database/supabase');
const { sendPaymentInstructions } = require('./paymentFlow');

async function createTicket(interaction, { orderType, categoryKey, summaryText, instructionText }) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user = interaction.user;
  const categoryId = config.categories[categoryKey] ?? config.categories.games;

  const categoryPrefixes = {
    robuxLogin: '🛡Rbxvilog',
    robuxGamepass: '💳rbxdelay',
    robuxGroupPayout: '👨‍👨‍👦‍👦Payout',
    robuxUsername: '🎮RbxUsername',
    fishit: '🎮Gamepass',
    fishitBoost: '🍀boostx8',
    forge: '🎮Gamepass',
    abyss: '🎮Gamepass',
    sawah: '🎮Gamepass',
    game: '🎮Gamepass',
    heartopia: '💎heartopia',
    discordServices: '💕Discord',
    reseller: '👨🏻‍💻reseller',
  };

  const safeName = user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);

  let prefix = categoryPrefixes[categoryKey];

  if (!prefix && categoryKey === 'games') {
    const type = orderType.toLowerCase().replace(/\s+/g, '');

    if (type.includes('fishitx8') || type.includes('boost')) {
      prefix = '🍀boostx8';
    } else if (
      type.includes('fishit') ||
      type.includes('forge') ||
      type.includes('abyss') ||
      type.includes('sawah') ||
      type.includes('slimerng') ||
      type.includes('survivetheapocalypse') ||
      type.includes('dragdrivesimulator') ||
      type.includes('dragonadventures') ||
      type.includes('game')
    ) {
      prefix = '🎮Gamepass';
    } else {
      prefix = '🎮game';
    }
  }

  prefix = prefix || 'order';

  const ticketId = `${prefix}-${safeName}-${Date.now().toString(36)}`;
  const channelName = `${prefix}-${safeName}`;

  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    ...(config.adminRoleId
      ? [{
          id: config.adminRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        }]
      : []),
  ];

  let extraRole = null;

  switch (categoryKey) {
    case 'robuxLogin':
      extraRole = config.robuxLoginRoleId;
      break;
    case 'robuxGamepass':
      extraRole = config.robuxGamepassRoleId;
      break;
    case 'robuxGroupPayout':
      extraRole = config.robuxPayoutRoleId;
      break;
    case 'robuxUsername':
      extraRole = config.robuxAdminRoleId ?? config.robuxLoginRoleId;
      break;
    case 'discordServices':
      extraRole = config.discordServicesRoleId;
      break;
    case 'reseller':
      extraRole = config.resellerRoleId;
      break;
    case 'games':
    default:
      extraRole = config.gamesAdminRoleId;
      break;
  }

  if (extraRole && extraRole !== config.adminRoleId) {
    overwrites.push({
      id: extraRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const openedAt = new Date().toISOString();
  let channel;

  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId || undefined,
      permissionOverwrites: overwrites,
      topic: JSON.stringify({
        openedAt,
        userId: user.id,
        ownerUserId: config.ownerUserId || null,
        orderType,
        summary: (summaryText || '').trim().slice(0, 500),
      }),
    });
  } catch (error) {
    console.error('[createTicket] Failed:', error);

    return interaction.editReply({
      content: '❌ Failed to create ticket channel.',
    });
  }

  // 🚀 Fast response to customer immediately upon channel creation!
  await interaction.editReply({
    content: `✅ Ticket created → ${channel}`,
  }).catch(() => {});

  // Save ticket record to database asynchronously
  createTicketRecord({
    ticketId,
    channelId: channel.id,
    userId: user.id,
    username: user.username,
    orderType,
    summary: summaryText,
    openedAt,
  }).catch(error => {
    console.error('[Supabase error]:', error);
  });

  const welcomeEmbed = new EmbedBuilder()
    .setTitle('🎫 MoonBlox - Tiket Dibuka')
    .setColor(0x5865F2)
    .setDescription(
      `🌙 Halo Moonguards! <@${user.id}> 👋\n\n` +
      '**🛍️ Ringkasan Pesanan:**\n' +
      summaryText.trim() +
      '\n\n' +
      (instructionText ||
        '📌 **Instruksi:**\n' +
        '• Ikuti arahan admin\n' +
        '• Standby selama proses')
    )
    .setFooter({ text: `Ticket ID: ${ticketId}` })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
    const roleIds = [...new Set(
    [config.adminRoleId, extraRole].filter(Boolean)
  )];

  const mentions = [
    `<@${user.id}>`,
    ...roleIds.map(r => `<@&${r}>`),
  ].join(' ');

  try {
    await channel.send({
      content: mentions,
      embeds: [welcomeEmbed],
      components: [closeRow],
      allowedMentions: {
        users: [user.id],
        roles: roleIds,
      },
    });

    await sendPaymentInstructions(channel, user);
  } catch (error) {
    console.error('[createTicket] post-create send failed:', error);
  }

  try {
    const ticketLink = `https://discord.com/channels/${guild.id}/${channel.id}`;

    const dmEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📦 Order Summary')
      .setDescription(
        `Order sudah di buat! check ticket nya di sini:\n${ticketLink}`
      )
      .addFields({
        name: '🛍️ Ringkasan Pesanan',
        value: summaryText.trim().slice(0, 1024),
      })
      .setFooter({ text: 'MoonBlox Store' })
      .setTimestamp();

    await user.send({
      embeds: [dmEmbed],
    });

  } catch (error) {
    console.error('[DM ERROR]:', error);
  }
}

module.exports = { createTicket };
