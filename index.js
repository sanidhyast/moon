require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Create client ─────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Load commands ─────────────────────────────────────────
client.commands = new Collection();

function loadCommandsFrom(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (command?.data?.name) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: /${command.data.name}`);
    }
  }
}

loadCommandsFrom(path.join(__dirname, 'commands'));
loadCommandsFrom(path.join(__dirname, 'commands', 'admin'));

// ── Load events ───────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[Events] Registered: ${event.name}`);
}

// ── Ready event ───────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n✅ MoonBlox Bot is online as ${client.user.tag}`);
  console.log(`   Serving ${client.guilds.cache.size} guild(s)\n`);
  client.user.setActivity('📦 MOONBLOX ORDERS', { type: 3 }); // WATCHING

  const newDescription = `✨Ready Gift Gamepass Rate 95 • Rbx Vilog Rate 75• Rbx Payout Rate 130 • Limited Items • Diamond Heartopia\n💫 Open ticket at Moonblox • Fast & Trusted even Marc Márquez  cant even balance🏍️`;

  try {
    await client.application.edit({
      description: newDescription,
    });
    console.log('[Bot Description] Successfully updated bot application description!');
  } catch (err) {
    console.error('[Bot Description] Failed to update application description:', err.message || err);
  }
});

// ── Global error handling ─────────────────────────────────
process.on('unhandledRejection', err => {
  console.error('[UnhandledRejection]', err);
});
process.on('uncaughtException', err => {
  console.error('[UncaughtException]', err);
});

// ── Login ─────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
