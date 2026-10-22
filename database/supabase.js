const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 🔥 normalize helper
const norm = (v) => v?.toString().toLowerCase().trim();

// 🚀 IN-MEMORY CACHE FOR HIGH-SPEED BOT WORKFLOWS
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const cache = {
  disabledItems: new Map(), // key: 'game' -> { data, timestamp }
  enabledItems: new Map(),  // key: 'game:category' -> { data, timestamp }
  disabledButtons: null,    // { data, timestamp }
  removedButtons: null,     // { data, timestamp }
};

function clearItemCache(game) {
  if (game) {
    const g = norm(game);
    cache.disabledItems.delete(g);
    for (const key of cache.enabledItems.keys()) {
      if (key.startsWith(`${g}:`)) {
        cache.enabledItems.delete(key);
      }
    }
  } else {
    cache.disabledItems.clear();
    cache.enabledItems.clear();
  }
}

function clearButtonCache() {
  cache.disabledButtons = null;
  cache.removedButtons = null;
}

/* ─────────────────────────────
   DISABLED ITEMS
──────────────────────────── */

async function getDisabledItems(game, category = null) {
  const g = norm(game);
  const c = category ? norm(category) : null;
  const now = Date.now();

  const cached = cache.disabledItems.get(g);
  let rawData;

  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    rawData = cached.data;
  } else {
    const { data, error } = await supabase
      .from('disabled_items')
      .select('item, category')
      .eq('game', g);

    if (error) {
      console.error('[Supabase] getDisabledItems error:', error.message);
      return cached ? cached.data.filter(r => !c || norm(r.category) === c).map(r => norm(r.item)) : [];
    }

    rawData = data || [];
    cache.disabledItems.set(g, { data: rawData, timestamp: now });
  }

  // 🔥 filter in JS instead (safe)
  return rawData
    .filter(r => !c || norm(r.category) === c)
    .map(r => norm(r.item));
}

async function disableItem(game, category, item) {
  clearItemCache(game);
  const g = norm(game);
  const c = norm(category);
  const v = norm(item);

  const { error } = await supabase
    .from('disabled_items')
    .upsert(
      { game: g, category: c, item: v },
      { onConflict: 'game,category,item' }
    );

  if (error) {
    console.error('[Supabase] disableItem error:', error.message);
    return false;
  }

  return true;
}

async function enableItem(game, category, item) {
  clearItemCache(game);
  const g = norm(game);
  const c = norm(category);
  const v = norm(item);

  const { error } = await supabase
    .from('disabled_items')
    .delete()
    .eq('game', g)
    .eq('category', c)
    .eq('item', v);

  if (error) {
    console.error('[Supabase] enableItem error:', error.message);
    return false;
  }

  return true;
}

/* ─────────────────────────────
   ENABLED ITEMS
──────────────────────────── */

async function getEnabledItems(game, category) {
  const g = norm(game);
  const c = norm(category);
  const cacheKey = `${g}:${c}`;
  const now = Date.now();

  const cached = cache.enabledItems.get(cacheKey);
  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const { data, error } = await supabase
    .from('enabled_items')
    .select('*')
    .eq('game', g)
    .eq('category', c)
    .order('position', { ascending: true }); // ✅ FIX

  if (error) {
    console.error('[Supabase] getEnabledItems error:', error.message);
    return cached ? cached.data : [];
  }

  const mapped = (data || []).map(i => ({
    label: i.label,
    value: norm(i.value),
    position: i.position // ✅ keep position
  }));

  cache.enabledItems.set(cacheKey, { data: mapped, timestamp: now });
  return mapped;
}

async function addEnabledItem(game, category, label, value, position) {
  clearItemCache(game);
  const g = norm(game);
  const c = norm(category);
  const v = norm(value);

  const { error } = await supabase
    .from('enabled_items')
    .upsert(
      {
        game: g,
        category: c,
        label,
        value: v,
        position // ✅ USE PASSED VALUE
      },
      {
        onConflict: 'game,category,value'
      }
    );

  if (error) {
    console.error('[Supabase] addEnabledItem error:', error.message);
    throw error;
  }
}

async function getRemovedButtons() {
  const now = Date.now();
  if (cache.removedButtons && (now - cache.removedButtons.timestamp < CACHE_TTL_MS)) {
    return cache.removedButtons.data;
  }

  const { data, error } = await supabase
    .from('removed_buttons')
    .select('button');

  if (error) {
    console.error('[Supabase] getRemovedButtons error:', error.message);
    return cache.removedButtons ? cache.removedButtons.data : [];
  }

  const mapped = (data || []).map(r => r.button.toLowerCase().trim());
  cache.removedButtons = { data: mapped, timestamp: now };
  return mapped;
}

async function removeButtonFully(button) {
  clearButtonCache();
  const { error } = await supabase
    .from('removed_buttons')
    .upsert({ button: button.toLowerCase().trim() });

  if (error) {
    console.error('[Supabase] removeButtonFully error:', error.message);
    return false;
  }

  return true;
}

async function insertButtonFully(button) {
  clearButtonCache();
  const { error } = await supabase
    .from('removed_buttons')
    .delete()
    .eq('button', button.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] insertButtonFully error:', error.message);
    return false;
  }

  return true;
}
/* ─────────────────────────────
   TICKETS
──────────────────────────── */

async function createTicketRecord(data) {

  const { error } = await supabase
    .from('tickets')
    .insert({
      ticket_id: data.ticketId,
      channel_id: data.channelId,
      user_id: data.userId,
      username: data.username,
      order_type: data.orderType,
      summary: data.summary,
      status: 'open',
      created_at: data.openedAt || new Date().toISOString()
    });

  if (error) {
    console.error('[Supabase] createTicketRecord error:', error.message);
    return false;
  }

  return true;
}

async function closeTicketRecord(channelId) {
  const { error } = await supabase
    .from('tickets')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString()
    })
    .eq('channel_id', channelId);

  if (error) {
    console.error('[Supabase] closeTicketRecord error:', error.message);
    return false;
  }

  return true;
}
/* ─────────────────────────────
   DISABLED PANEL BUTTONS
──────────────────────────── */

async function getDisabledButtons() {
  const now = Date.now();
  if (cache.disabledButtons && (now - cache.disabledButtons.timestamp < CACHE_TTL_MS)) {
    return cache.disabledButtons.data;
  }

  const { data, error } = await supabase
    .from('disabled_buttons')
    .select('button');

  if (error) {
    console.error('[Supabase] getDisabledButtons error:', error.message);
    return cache.disabledButtons ? cache.disabledButtons.data : [];
  }

  const mapped = (data || []).map(r => r.button.toLowerCase().trim());
  cache.disabledButtons = { data: mapped, timestamp: now };
  return mapped;
}

async function disableButton(button) {
  clearButtonCache();
  const { error } = await supabase
    .from('disabled_buttons')
    .upsert({ button: button.toLowerCase().trim() });

  if (error) {
    console.error('[Supabase] disableButton error:', error.message);
    return false;
  }

  return true;
}

async function enableButton(button) {
  clearButtonCache();
  const { error } = await supabase
    .from('disabled_buttons')
    .delete()
    .eq('button', button.toLowerCase().trim());

  if (error) {
    console.error('[Supabase] enableButton error:', error.message);
    return false;
  }

  return true;
}

module.exports = {
  supabase, // ✅ ADD THIS
  getDisabledItems,
  getEnabledItems,
  disableItem,
  enableItem,
  addEnabledItem,
  createTicketRecord,
  closeTicketRecord,
  getDisabledButtons,
  disableButton,
  enableButton,
  getRemovedButtons,
  removeButtonFully,
  insertButtonFully,
  clearItemCache,
  clearButtonCache,
};
