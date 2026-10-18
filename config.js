require('dotenv').config();

module.exports = {
  // Channels
  publicTranscriptChannelId: process.env.PUBLIC_TRANSCRIPT_CHANNEL_ID,
  transcriptLogChannelId: process.env.TRANSCRIPT_LOG_CHANNEL_ID,
  testimonialChannelId: process.env.TESTIMONIAL_CHANNEL_ID || '1436690762866753536',

  // Roles
  adminRoleId:            process.env.ADMIN_ROLE_ID,
  robuxAdminRoleId:       process.env.ROBUX_ADMIN_ROLE_ID,
  robuxLoginRoleId:       process.env.ROBUX_LOGIN_ROLE_ID,
  robuxGamepassRoleId:    process.env.ROBUX_GAMEPASS_ROLE_ID,
  robuxPayoutRoleId:      process.env.ROBUX_PAYOUT_ROLE_ID,
  heartopiaAdminRoleId:   process.env.HEARTOPIA_ADMIN_ROLE_ID,
  gamesAdminRoleId:       process.env.GAMES_ADMIN_ROLE_ID,
  discordServicesRoleId:  process.env.DISCORD_SERVICES_ROLE_ID,
  resellerRoleId:         process.env.RESELLER_ROLE_ID,
  ownerUserId:            process.env.OWNER_USER_ID,
  adminUserIds:           (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
  paymentQrImagePath:     process.env.PAYMENT_QR_IMAGE,

  // Ticket categories (Discord category channel IDs)
  categories: {
    robuxLogin:       process.env.CATEGORY_ROBUX_LOGIN,
    robuxGamepass:    process.env.CATEGORY_ROBUX_GAMEPASS,
    robuxGroupPayout: process.env.CATEGORY_ROBUX_GROUPPAYOUT,
    heartopia:        process.env.CATEGORY_HEARTOPIA,
    games:            process.env.CATEGORY_GAMES,
    robuxUsername:    process.env.CATEGORY_ROBUX_USERNAME,
    discordServices:  process.env.DISCORD_SERVICES_CATEGORY_ID,
    reseller:         process.env.CATEGORY_RESELLER,
  },
};
