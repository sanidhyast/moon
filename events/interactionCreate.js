const robuxLogin       = require('../orderflows/robuxLogin');
const robuxGamepass    = require('../orderflows/robuxGamepass');
const robuxGroupPayout = require('../orderflows/robuxGroupPayout');
const robuxUsername    = require('../orderflows/robuxUsername');
const heartopia        = require('../orderflows/diamondHeartopia');
const fishit           = require('../orderflows/fishit');
const fishitBoost      = require('../orderflows/fishitBoost');
const forge            = require('../orderflows/forge');
const abyss            = require('../orderflows/abyss');
const sawahIndo        = require('../orderflows/sawahIndo');
const gameLain         = require('../orderflows/gameLain');
const kickLuckyBlock   = require('../orderflows/kickLuckyBlock');
const discordNitro     = require('../orderflows/discordNitro');
const slimeRng         = require('../orderflows/slimeRng');
const surviveApocalypse = require('../orderflows/surviveApocalypse');
const dragDriveSimulator = require('../orderflows/dragDriveSimulator');
const dragonAdventures = require('../orderflows/dragonAdventures');
const resellerMoonblox = require('../orderflows/resellerMoonblox');

const items = require('../data/items');
const { getAllPanelButtonIds } = require('../utils/panelRows');

const { 
  getDisabledItems,
  getEnabledItems
} = require('../database/supabase');

const { handleClose, handleCloseModal } = require('../tickets/closeTicket');
const {
  handlePaymentDone,
  handlePaymentVerify,
  handleOrderDone
} = require('../tickets/paymentFlow');
const {
  handleRatingButton,
  handleTestimonialModal,
} = require('../tickets/testimonialFlow');

const FLOW_HANDLERS = {
  rl_:  robuxLogin.handleInteraction,
  rg_:  robuxGamepass.handleInteraction,
  rgp_: robuxGroupPayout.handleInteraction,
  ru_:  robuxUsername.handleInteraction,
  dh_:  heartopia.handleInteraction,
  fi_:  fishit.handleInteraction,
  fib_: fishitBoost.handleInteraction,
  fo_:  forge.handleInteraction,
  ab_:  abyss.handleInteraction,
  si_:  sawahIndo.handleInteraction,
  gl_:  gameLain.handleInteraction,
  klb_: kickLuckyBlock.handleInteraction,
  ds_:  discordNitro.handleInteraction,
  sr_:  slimeRng.handleInteraction,
  sa_:  surviveApocalypse.handleInteraction,
  dd_:  dragDriveSimulator.handleInteraction,
  da_:  dragonAdventures.handleInteraction,
  rs_:  resellerMoonblox.handleInteraction,
};

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {

    /* ─────────────────────────────
       AUTOCOMPLETE
    ───────────────────────────── */

    if (interaction.isAutocomplete()) {
  if (interaction.commandName === 'close' || interaction.commandName === 'open') {
  const focused = interaction.options.getFocused().toLowerCase();

  const allButtons = getAllPanelButtonIds();

  const { getDisabledButtons } = require('../database/supabase');
  const disabled = await getDisabledButtons();

  let choices = [];

  if (interaction.commandName === 'close') {
    choices = allButtons.filter(b => !disabled.includes(b));
  }

  if (interaction.commandName === 'open') {
    choices = allButtons.filter(b => disabled.includes(b));
  }

  return interaction.respond(
    choices
      .filter(c => c.toLowerCase().includes(focused))
      .map(c => ({ name: c, value: c }))
  );
}
if (interaction.commandName === 'delete' || interaction.commandName === 'insert') {
  const focused = interaction.options.getFocused().toLowerCase();

  const allButtons = getAllPanelButtonIds();

  const { getRemovedButtons } = require('../database/supabase');
  const removed = await getRemovedButtons();

  let choices = [];

  if (interaction.commandName === 'delete') {
    choices = allButtons.filter(b => !removed.includes(b));
  }

  if (interaction.commandName === 'insert') {
    choices = allButtons.filter(b => removed.includes(b));
  }

  return interaction.respond(
    choices
      .filter(c => c.toLowerCase().includes(focused))
      .map(c => ({ name: c, value: c }))
  );
}
      try {
        const focused = interaction.options.getFocused(true) || {};
        const search = (focused.value || '').toLowerCase();

        const game = interaction.options.getString('game');
        const category = interaction.options.getString('category');

        if (!game || !items[game]) {
          return interaction.respond([]);
        }

        const gameData = items[game];

        /* CATEGORY AUTOCOMPLETE */
        if (focused?.name === 'category') {

          let categories = [];

          if (game === 'fishitBoost') {
            categories = gameData.methods.map(m => ({
              name: m.label,
              value: m.value
            }));
          }

          else if (game === 'kickLuckyBlock' || game === 'discordNitro') {
            categories = gameData.categories.map(c => ({
              name: c.label,
              value: c.value
            }));
          }

          else if (game === 'robuxUsername') {
            categories = [{ name: 'packages', value: 'packages' }];
          }

          else if (gameData.categories) {
            categories = gameData.categories.map(c => ({
              name: c.label,
              value: c.value
            }));
          }

          else if (!Array.isArray(gameData)) {
            categories = Object.keys(gameData)
              .filter(k => k !== 'categories')
              .map(k => ({
                name: k,
                value: k
              }));
          }

          categories = categories.filter(c =>
            c.name.toLowerCase().includes(search)
          );

          return interaction.respond(categories.slice(0, 25));
        }

        /* ITEM AUTOCOMPLETE */
        if (focused?.name === 'item') {

          if (!category) return interaction.respond([]);

          let base = [];

          if (game === 'fishitBoost') {
            if (category === 'gift') base = gameData.giftPackages;
            if (category === 'login') base = gameData.loginPackages;
          }

          else if (game === 'robuxUsername') {
            base = items.robuxUsernamePackages ?? [];
          }

          else if (game === 'kickLuckyBlock') {
            base = gameData[category] ?? [];
          }

          else if (game === 'discordNitro') {
            // discordNitro uses subcategories like nitro_boost, server_boost_1mo, etc.
            // For autocomplete, show items from the exact category key
            const catKey = category === 'server_boost' ? 'server_boost_1mo' : category;
            base = gameData[catKey] ?? [];
          }

          else if (Array.isArray(gameData)) {
            base = gameData;
          }

          else if (gameData[category]) {
            base = gameData[category];
          }

          const enabled = await getEnabledItems(game, category);

          const enabledFormatted = enabled.map(i => ({
            label: i.label,
            value: i.value
          }));

          const merged = [...base, ...enabledFormatted];

          const disabled = await getDisabledItems(game, category);

          const results = merged
            .filter(i => !disabled.includes(i.value))
            .filter(i => i.label.toLowerCase().includes(search))
            .slice(0, 25)
            .map(i => ({
              name: i.label,
              value: i.value
            }));

          return interaction.respond(results);
        }

      } catch (err) {
        console.error('Autocomplete error:', err);
        return interaction.respond([]);
      }
    }

    /* ─────────────────────────────
       SLASH COMMANDS
    ───────────────────────────── */

    if (interaction.isChatInputCommand()) {

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {

        console.error(`[Command] /${interaction.commandName} error:`, err);

        const msg = {
          content: '❌ An error occurred executing that command.',
          flags: 64
        };

        try {
          if (interaction.replied || interaction.deferred)
            await interaction.followUp(msg);
          else
            await interaction.reply(msg);
        } catch (_) {}
      }

      return;
    }

    /* ─────────────────────────────
       MODALS
    ───────────────────────────── */

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'close_ticket_modal') {
        try {
          return await handleCloseModal(interaction);
        } catch (err) {
          console.error('[Modal Submit Error] close_ticket_modal:', err);
        }
      }

      if (interaction.customId === 'modal_rate_5') {
        try {
          return await handleTestimonialModal(interaction, client);
        } catch (err) {
          console.error('[Modal Submit Error] modal_rate_5:', err);
        }
      }
    }

    const id = interaction.customId;

    /* ─────────────────────────────
       BUTTONS
    ───────────────────────────── */

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('rate_star_')) {
        try {
          return await handleRatingButton(interaction);
        } catch (err) {
          console.error('[Rating Button Error]', err);
        }
        return;
      }

           const PANEL_HANDLERS = {
        robux_login:         () => robuxLogin.showPriceList(interaction),
        robux_gamepass:      () => robuxGamepass.showPriceList(interaction),
        robux_group_1:       () => robuxGroupPayout.showPriceList(interaction, 1),
        robux_group_2:       () => robuxGroupPayout.showPriceList(interaction, 2),
        robux_group_3:       () => robuxGroupPayout.showPriceList(interaction, 3),
        robux_username:      () => robuxUsername.showPriceList(interaction),
        heartopia:           () => heartopia.showPriceList(interaction),
        fishit:              () => fishit.showPriceList(interaction),
        boost_fishit:        () => fishitBoost.showPriceList(interaction),
        forge:               () => forge.showPriceList(interaction),
        abyss:               () => abyss.showPriceList(interaction),
        sawah:               () => sawahIndo.showPriceList(interaction),
        game_lain:           () => gameLain.showPriceList(interaction),
        kick_lucky_block:    () => kickLuckyBlock.showPriceList(interaction),
        discord_nitro:       () => discordNitro.showPriceList(interaction),
        slime_rng:           () => slimeRng.showPriceList(interaction),
        survive_apocalypse:  () => surviveApocalypse.showPriceList(interaction),
        drag_drive:          () => dragDriveSimulator.showPriceList(interaction),
        dragon_adventures:   () => dragonAdventures.showPriceList(interaction),
        reseller_moonblox:   () => resellerMoonblox.showPriceList(interaction),
        payment_done:        () => handlePaymentDone(interaction),
        payment_verify:      () => handlePaymentVerify(interaction),
        order_done:          () => handleOrderDone(interaction),
        ticket_close:        () => handleClose(interaction),
      };

      if (PANEL_HANDLERS[id]) {
        try {
          await PANEL_HANDLERS[id]();
        } catch (err) {
          console.error(`[Button] ${id} error:`, err);
          const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
          try {
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(msg);
            } else if (err.code !== 10062) {
              await interaction.reply(msg);
            }
          } catch (_) {}
        }
      }
    }

    /* ─────────────────────────────
       ORDER FLOW ROUTER
    ───────────────────────────── */

    for (const [prefix, handler] of Object.entries(FLOW_HANDLERS)) {

      if (id.startsWith(prefix)) {

        try {
          await handler(interaction);
        } catch (err) {

          console.error(`[Flow] ${prefix} handler error:`, err);

          const msg = {
            content: '❌ Something went wrong. Please try again.',
            ephemeral: true
          };

          try {
            if (interaction.replied || interaction.deferred)
              await interaction.followUp(msg);
            else
              await interaction.reply(msg);
          } catch (_) {}
        }

        return;
      }
    }
  },
};
