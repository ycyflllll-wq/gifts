// Bot side of alerts: reads commands sent to the bot since the last run, keeps filters in alerts.json,
// and messages the owner about new listings that match them. Runs inside the collector (every ~30 min).
import { createRequire } from 'node:module';

const { filterGifts } = createRequire(import.meta.url)('../docs/filters.js');

const MAX_PER_ALERT = 10; // listings per alert per message, so a broad filter can't flood the chat
const LISTS = ['names', 'models', 'backdrops', 'symbols'];
const HELP = [
  'Я надсилаю сповіщення про нові подарунки на маркетах.',
  '',
  'Створити: у застосунку виберіть фільтри → 🔔 → надішліть мені скопійовану команду /alert.',
  '/alerts — мої сповіщення',
  '/stop 3 — видалити сповіщення №3, /stop all — усі',
  '',
  'Я відповідаю раз на ~30 хвилин.',
].join('\n');

const money = g => `${g.price} ${g.currency === 'XTR' ? '⭐' : 'TON'}`;
const line = g => `${g.name} #${g.id} — ${money(g)}\n${g.url}`;

// Listings that are new or got cheaper since the previous run.
export function freshListings(prev, next) {
  const old = new Map(prev.map(g => [g.url, g.price]));
  return next.filter(g => !old.has(g.url) || g.price < old.get(g.url));
}

// Keeps only known filter fields with the right types: the command text comes from a chat.
export function cleanFilter(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = {};
  for (const k of LISTS) if (Array.isArray(raw[k])) f[k] = raw[k].filter(v => typeof v === 'string').slice(0, 50);
  for (const k of ['priceMin', 'priceMax']) if (typeof raw[k] === 'number' && raw[k] >= 0) f[k] = raw[k];
  for (const k of ['mono', 'fewDigits']) if (raw[k] === true) f[k] = true;
  if (typeof raw.query === 'string' && raw.query.trim()) f.query = raw.query.trim().slice(0, 50);
  return Object.keys(f).length ? f : null;
}

export function describe(f) {
  const parts = [];
  const names = { names: 'Колекція', models: 'Модель', backdrops: 'Фон', symbols: 'Символ' };
  for (const k of LISTS) if (f[k]?.length) parts.push(`${names[k]}: ${f[k].join(', ')}`);
  if (f.priceMin != null || f.priceMax != null) parts.push(`Ціна: ${f.priceMin ?? 0}–${f.priceMax ?? '∞'}`);
  if (f.mono) parts.push('Монохромні');
  if (f.fewDigits) parts.push('≤ 3 цифри');
  if (f.query) parts.push(`Пошук: ${f.query}`);
  return parts.join('; ');
}

// Alerts that existed before this run, about listings that appeared since the previous run.
export function alertMessages(store, fresh) {
  return store.alerts.flatMap(a => {
    const hits = filterGifts(fresh, a.filter);
    if (!hits.length) return [];
    const more = hits.length > MAX_PER_ALERT ? `\n…і ще ${hits.length - MAX_PER_ALERT}` : '';
    return [{ chat: a.chat, text: `🔔 #${a.id} (${describe(a.filter)})\n\n${hits.slice(0, MAX_PER_ALERT).map(line).join('\n\n')}${more}` }];
  });
}

// Applies bot commands to the store and returns replies. No network here, so it is easy to test.
export function applyCommands(store, updates, gifts) {
  const replies = [];
  for (const u of updates) {
    store.offset = u.update_id + 1;
    const msg = u.message;
    if (!msg?.text || !msg.from) continue;
    const chat = msg.chat.id;
    store.owner ??= msg.from.id; // the first person to write to the bot becomes its owner
    if (msg.from.id !== store.owner) {
      replies.push({ chat, text: 'Це приватний бот.' });
      continue;
    }
    const text = msg.text.trim();
    const cmd = text.split(/\s/)[0].replace(/@.*/, '').toLowerCase();
    const arg = text.slice(text.split(/\s/)[0].length).trim();

    if (cmd === '/alert') {
      let filter = null;
      try { filter = cleanFilter(JSON.parse(arg)); } catch { /* reported below */ }
      if (!filter) {
        replies.push({ chat, text: 'Не зрозумів фільтр. Створіть сповіщення кнопкою 🔔 у застосунку і надішліть скопійовану команду.' });
        continue;
      }
      const id = Math.max(0, ...store.alerts.map(a => a.id)) + 1;
      store.alerts.push({ id, chat, filter });
      const now = filterGifts(gifts, filter);
      const cheapest = now.length ? `\nНайдешевший зараз: ${line(now[0])}` : '';
      replies.push({ chat, text: `✓ Сповіщення #${id}: ${describe(filter)}\nЗараз підходить лотів: ${now.length}.${cheapest}` });
    } else if (cmd === '/alerts') {
      const mine = store.alerts.filter(a => a.chat === chat);
      replies.push({ chat, text: mine.length ? mine.map(a => `#${a.id}: ${describe(a.filter)}`).join('\n') : 'Сповіщень немає.' });
    } else if (cmd === '/stop') {
      const before = store.alerts.length;
      store.alerts = store.alerts.filter(a => a.chat !== chat || (arg !== 'all' && String(a.id) !== arg));
      replies.push({ chat, text: before === store.alerts.length ? 'Такого сповіщення немає. Список: /alerts' : '✓ Видалено.' });
    } else {
      replies.push({ chat, text: HELP });
    }
  }
  return replies;
}

export async function runAlerts({ token, store, prev, next }) {
  const api = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`Bot API ${method}: ${json.description}`);
    return json.result;
  };
  const me = await api('getMe', {});
  // Notify existing alerts first, so a brand-new alert doesn't get everything that's on sale right now.
  const replies = alertMessages(store, freshListings(prev, next));
  const updates = await api('getUpdates', { offset: store.offset, timeout: 0, allowed_updates: ['message'] });
  replies.push(...applyCommands(store, updates, next));
  for (const r of replies) {
    // One failed message (e.g. the chat blocked the bot) must not lose the saved alerts and offset.
    await api('sendMessage', { chat_id: r.chat, text: r.text, link_preview_options: { is_disabled: true } })
      .catch(e => console.error(e.message));
  }
  return me.username;
}
