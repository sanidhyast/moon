const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');

const items = require('../data/items');
const session = require('./sessionManager');
const { getDisabledItems, getEnabledItems } = require('../database/supabase');

function createCatalogFlow({
  flowPrefix,
  dataKey,
  productName,
  priceListTitle,
  usernameModalTitle,
  instructionText,
  categoryKey = 'games',
}) {
  const orderCustomId = `${flowPrefix}_order`;
  const usernameModalId = `${flowPrefix}_username_modal`;
  const usernameInputId = `${flowPrefix}_username`;
  const categorySelectId = `${flowPrefix}_cat_select`;
  const itemSelectId = `${flowPrefix}_item_select`;
  const addYesId = `${flowPrefix}_add_yes`;
  const addNoId = `${flowPrefix}_add_no`;
  const createTicketId = `${flowPrefix}_create_ticket`;
  const cancelId = `${flowPrefix}_cancel`;

  function getData() {
    return items[dataKey] ?? {};
  }

  function getCategories() {
    return getData().categories ?? [];
  }

  function getCategoryLabel(value) {
    return getCategories().find(category => category.value === value)?.label ?? value;
  }

  async function loadCategoryItems(category) {
    const game = dataKey.toLowerCase().trim();
    const normalizedCategory = category.toLowerCase().trim();
    const base = getData()[normalizedCategory] ?? [];

    const [disabledRaw, enabledRaw] = await Promise.all([
      getDisabledItems(game, normalizedCategory),
      getEnabledItems(game, normalizedCategory),
    ]);

    const disabledSet = new Set(
      disabledRaw.map(value => value.toLowerCase().trim())
    );

    const baseFiltered = base.filter(
      item => !disabledSet.has(item.value.toLowerCase().trim())
    );

    const enabledFiltered = enabledRaw
      .map(item => ({
        label: item.label,
        value: item.value.toLowerCase().trim(),
      }))
      .filter(item => !disabledSet.has(item.value))
      .filter(item => !base.some(baseItem => baseItem.value.toLowerCase().trim() === item.value));

    return [...baseFiltered, ...enabledFiltered];
  }

  async function showPriceList(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const banner = new AttachmentBuilder('./pricing.png', { name: 'pricing.png' });
    const categories = getCategories();

    const sections = await Promise.all(
      categories.map(async category => {
        const categoryItems = await loadCategoryItems(category.value);
        return `**${category.label}**\n${categoryItems.map(item => item.label).join('\n') || '*Currently unavailable*'}`;
      })
    );

    const embed = new EmbedBuilder()
      .setTitle(priceListTitle)
      .setColor(0x5865F2)
      .setDescription(sections.join('\n\n'))
      .setImage('attachment://pricing.png')
      .setFooter({ text: 'MoonBlox • Click Order to proceed' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(orderCustomId)
        .setLabel('Order')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🛒')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
      files: [banner],
    });
  }

  async function showUsernameModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(usernameModalId)
      .setTitle(usernameModalTitle);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(usernameInputId)
          .setLabel('👤 Username')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  }

  async function showCategorySelect(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Pilih kategori yang di inginkan')
      .setColor(0x5865F2);

    const select = new StringSelectMenuBuilder()
      .setCustomId(categorySelectId)
      .setPlaceholder('Pilih kategori...')
      .addOptions(getCategories());

    const payload = {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    };

    if (interaction.isButton()) {
      return interaction.update(payload);
    }

    return interaction.reply(payload);
  }

  async function showItemSelect(interaction, category) {
    const available = await loadCategoryItems(category);

    if (available.length === 0) {
      return interaction.update({
        content: '⚠️ No items are currently available in this category.',
        embeds: [],
        components: [],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛍️ Detail Produk')
      .setColor(0xFEE75C)
      .setDescription('🛒 Pilih item yang ingin di beli');

    const select = new StringSelectMenuBuilder()
      .setCustomId(itemSelectId)
      .setPlaceholder('Pilih item...')
      .addOptions(available);

    return interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  }

  async function askAddMore(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Tambah Item?')
      .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(addYesId)
        .setLabel('Tambah Item')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(addNoId)
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    return interaction.update({
      content: '',
      embeds: [embed],
      components: [row],
    });
  }

  async function showSummary(interaction) {
    const currentSession = session.getSession(interaction.user.id);

    const itemsText = (currentSession.cart || [])
      .map((entry, index) => `\n${index + 1}. ${entry.category} -> ${entry.item}`)
      .join('');

    const embed = new EmbedBuilder()
      .setTitle('🛍️ Detail Pembelian')
      .setColor(0x5865F2)
      .setDescription(
        `📋 **Produk:** ${productName}\n` +
        `👤 **Username:** ${currentSession.username}\n` +
        `🛒 **Items:** ${itemsText}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(createTicketId)
        .setLabel('Create Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎫'),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.update({
      embeds: [embed],
      components: [row],
    });
  }

  async function createTicket(interaction) {
    const { createTicket: openTicket } = require('../tickets/createTicket');
    const currentSession = session.getSession(interaction.user.id);

    const itemsText = (currentSession.cart || [])
      .map((entry, index) => `\n${index + 1}. ${entry.category} -> ${entry.item}`)
      .join('');

    const summaryText =
      `**📋 Produk:** ${productName}\n` +
      `**👤 Username:** ${currentSession.username}\n` +
      `**🛒 Items:** ${itemsText}`;

    await openTicket(interaction, {
      orderType: productName,
      categoryKey,
      summaryText,
      instructionText,
    });

    session.deleteSession(interaction.user.id);
  }

  async function handleInteraction(interaction) {
    const id = interaction.customId;
    const userId = interaction.user.id;

    if (id === orderCustomId) {
      session.setSession(userId, {
        flow: flowPrefix,
        step: 1,
        cart: [],
      });

      return showUsernameModal(interaction);
    }

    if (interaction.isModalSubmit() && id === usernameModalId) {
      const username = interaction.fields.getTextInputValue(usernameInputId);

      session.updateSession(userId, {
        step: 2,
        username,
      });

      return showCategorySelect(interaction);
    }

    if (id === categorySelectId) {
      const category = interaction.values[0];

      session.updateSession(userId, {
        step: 3,
        category,
      });

      return showItemSelect(interaction, category);
    }

    if (id === itemSelectId) {
      const selected = interaction.values[0];
      const currentSession = session.getSession(userId);
      const available = await loadCategoryItems(currentSession.category);
      const item = available.find(option => option.value === selected);

      currentSession.cart = currentSession.cart || [];
      currentSession.cart.push({
        category: getCategoryLabel(currentSession.category),
        item: item?.label ?? selected,
      });

      session.updateSession(userId, {
        cart: currentSession.cart,
        step: 'add_more',
      });

      return askAddMore(interaction);
    }

    if (id === addYesId) {
      session.updateSession(userId, {
        step: 2,
        category: null,
      });

      return showCategorySelect(interaction);
    }

    if (id === addNoId) {
      return showSummary(interaction);
    }

    if (id === createTicketId) {
      return createTicket(interaction);
    }

    if (id === cancelId) {
      session.deleteSession(userId);

      return interaction.update({
        content: '❌ Order cancelled.',
        embeds: [],
        components: [],
      });
    }
  }

  return {
    showPriceList,
    handleInteraction,
  };
}

module.exports = createCatalogFlow;
