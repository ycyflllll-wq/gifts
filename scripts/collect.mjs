// Collects collectible gifts for sale on Telegram's own market and on MRKT into docs/gifts.json,
// then lets the bot handle alert commands and notify about new matching listings (scripts/alerts.mjs).
// Run: node --env-file=.env scripts/collect.mjs  (GitHub Actions passes the same vars as secrets)
import { Long, MemoryStorage, TelegramClient } from '@mtcute/node';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { key, parseSavedSearches, runAlerts } from './alerts.mjs';
import { fetchIsMonochrome } from './mono.mjs';
import { mrktLogin, mrktQuery, mrktSearch, mrktToGift } from './mrkt.mjs';

// shortcut: only the cheapest listings per collection (the market has ~800k), so the page stays light enough
// for a phone; saved searches additionally look through the whole market (see below).
const PER_COLLECTION = 100; // Telegram
const MRKT_PAGES = 2; // × 20 = 40 per collection on MRKT
const PER_SEARCH = 100; // cheapest whole-market matches per saved search (per collection on Telegram)
const DEEP_COLLECTION = 300; // a saved search naming only collections gets this many of each, not just 100
// shortcut: whole-market searches cost about two Telegram calls per collection, and a search naming no collection
// spans all ~120; past this many calls per run the rest waits for the next run.
const MAX_SEARCH_CALLS = 200;
// Monochrome checks (one small picture per gift) are cached in mono-cache.json; new ones get at most this long
// per run, so a cold cache fills over a couple of runs and those gifts aren't marked monochrome meanwhile.
const MONO_BUDGET_MS = 4 * 60_000;
// The owner forbade any purchases from their account, so the client may only call these methods:
// two read-only gift lists, opening the MRKT mini app to log in there (it buys or sends nothing),
// and reading (never writing) the searches the owner saved in our app's CloudStorage.
const READ_ONLY = new Set(['payments.getStarGifts', 'payments.getResaleStarGifts', 'messages.requestAppWebView', 'bots.invokeWebViewCustomMethod']);
const READ_ONLY_CUSTOM = new Set(['getStorageValues']);

const file = p => new URL(`../${p}`, import.meta.url);
const readJson = (p, fallback) => existsSync(file(p)) ? JSON.parse(readFileSync(file(p), 'utf8')) : fallback;
const writeJson = (p, data, pretty) => writeFileSync(file(p), JSON.stringify(data, null, pretty ? 2 : 0) + '\n');

const hex = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const rarity = r => !r ? undefined : r._ === 'starGiftAttributeRarity' ? `${r.permille / 10}%` : r._.replace('starGiftAttributeRarity', '');
const backdropOf = g => g.attributes.find(a => a._ === 'starGiftAttributeBackdrop');

// Sets g.seen = when each listing was first seen (unix seconds) and returns the updated map, keeping only
// listings still on sale. A cold map (first run, lost cache) gives 0: nothing is "new" just because the cache was empty.
export function stampSeen(gifts, seen, now) {
  const cold = !Object.keys(seen).length;
  const next = {};
  for (const g of gifts) g.seen = next[key(g)] = seen[key(g)] ?? (cold ? 0 : now);
  return next;
}

// A saved search's models/symbols/backdrops as Telegram's attribute ids for one collection, given that collection's
// attribute list. [] = nothing to filter by; null = it names some that don't exist here, so nothing can match.
export function attributeIds(attributes, f) {
  const find = (type, names, toId) => names?.length ? attributes.filter(a => a._ === type && names.includes(a.name)).map(toId) : [];
  const models = find('starGiftAttributeModel', f.models, a => ({ _: 'starGiftAttributeIdModel', documentId: a.document.id }));
  const symbols = find('starGiftAttributePattern', f.symbols, a => ({ _: 'starGiftAttributeIdPattern', documentId: a.document.id }));
  const backdrops = find('starGiftAttributeBackdrop', f.backdrops, a => ({ _: 'starGiftAttributeIdBackdrop', backdropId: a.backdropId }));
  if ((f.models?.length && !models.length) || (f.symbols?.length && !symbols.length) || (f.backdrops?.length && !backdrops.length)) return null;
  return [...models, ...symbols, ...backdrops];
}

// Up to `want` gifts for sale, cheapest first, following next_offset; count/attributes come from the first page.
export async function resale(call, params, want) {
  const gifts = [];
  let offset = '';
  let res, first;
  do {
    res = await call({ _: 'payments.getResaleStarGifts', sortByPrice: true, ...params, offset, limit: Math.min(100, want - gifts.length) });
    first ??= res;
    gifts.push(...res.gifts.filter(g => g._ === 'starGiftUnique' && g.resellAmount?.length));
    offset = res.nextOffset;
  } while (offset && res.gifts.length && gifts.length < want);
  return { gifts, count: first.count, attributes: first.attributes };
}

// isMono: result of the picture check in scripts/mono.mjs, if it has been done.
export function toGift(g, isMono) {
  const attr = type => g.attributes.find(a => a._ === type);
  const model = attr('starGiftAttributeModel');
  const backdrop = attr('starGiftAttributeBackdrop');
  const symbol = attr('starGiftAttributePattern');
  const ton = g.resellAmount?.find(a => a._ === 'starsTonAmount');
  const stars = g.resellAmount?.find(a => a._ === 'starsAmount');
  return {
    id: g.num,
    name: g.title,
    model: model?.name,
    backdrop: backdrop?.name,
    symbol: symbol?.name,
    model_rarity: rarity(model?.rarity),
    backdrop_rarity: rarity(backdrop?.rarity),
    symbol_rarity: rarity(symbol?.rarity),
    backdrop_colors: backdrop && [hex(backdrop.centerColor), hex(backdrop.edgeColor)],
    ...(ton ? { price: Number(String(ton.amount)) / 1e9, currency: 'TON' } : { price: Number(String(stars?.amount ?? 0)), currency: 'XTR' }),
    is_monochrome: isMono === true,
    market: 'Telegram',
    image: `https://nft.fragment.com/gift/${g.slug.toLowerCase()}.webp`,
    url: `https://t.me/nft/${g.slug}`,
  };
}

async function main() {
  if (!process.env.TG_SESSION) {
    console.log('No Telegram session yet (run scripts/login.mjs) — skipping.');
    return;
  }
  const client = new TelegramClient({
    apiId: Number(process.env.TG_API_ID),
    apiHash: process.env.TG_API_HASH,
    storage: new MemoryStorage(),
  });
  const call = req => {
    if (!READ_ONLY.has(req._)) throw new Error(`Blocked ${req._}: this script is read-only`);
    if (req._ === 'bots.invokeWebViewCustomMethod' && !READ_ONLY_CUSTOM.has(req.customMethod)) {
      throw new Error(`Blocked ${req.customMethod}: this script is read-only`);
    }
    // Telegram throttles bursts of resale queries (FLOOD_WAIT ~40 s); waiting it out is fine for a background job.
    return client.call(req, { floodSleepThreshold: 180_000 });
  };
  await client.start({ session: process.env.TG_SESSION });

  // The owner's saved searches live in our bot's CloudStorage, readable from the owner's own account.
  let searches = [];
  if (process.env.TG_BOT_TOKEN) {
    try {
      const me = await (await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/getMe`)).json();
      const bot = await client.resolveUser(me.result.username);
      const res = await call({
        _: 'bots.invokeWebViewCustomMethod', bot, customMethod: 'getStorageValues',
        params: { _: 'dataJSON', data: JSON.stringify({ keys: ['searches'] }) },
      });
      searches = parseSavedSearches(res.data);
      console.log(`Saved searches with alerts: ${searches.length}`);
    } catch (e) {
      console.error(`Saved searches skipped: ${e.message}`);
    }
  }
  const onMarket = (s, market) => !s.filter.markets?.length || s.filter.markets.includes(market);

  const { gifts: bases } = await call({ _: 'payments.getStarGifts', hash: 0 });
  const onResale = bases.filter(b => b._ === 'starGift' && Number(String(b.availabilityResale ?? 0)) > 0);

  // Each listing with what the monochrome check needs: the gift's slug and its backdrop colours.
  // A listing can turn up both among the cheapest and in a saved search, so it is added once.
  const items = [];
  const have = new Set();
  const add = item => { if (!have.has(key(item.gift))) { have.add(key(item.gift)); items.push(item); } };
  const fromTelegram = g => ({ gift: toGift(g), slug: g.slug, center: backdropOf(g)?.centerColor, edge: backdropOf(g)?.edgeColor });
  const fromMrkt = m => ({ gift: mrktToGift(m), slug: m.name, center: m.backdropColorsCenterColor, edge: m.backdropColorsEdgeColor });

  const counts = {};
  const giftIds = {}; // collection title → its base gift id, for the whole-market searches
  for (const base of onResale) {
    const { gifts, count } = await resale(call, { giftId: base.id }, PER_COLLECTION);
    if (!gifts.length) continue;
    counts[gifts[0].title] = count;
    giftIds[gifts[0].title] = base.id;
    gifts.forEach(g => add(fromTelegram(g)));
  }
  if (!items.length) throw new Error('No gifts collected — keeping the previous gifts.json');

  // Saved searches look through the whole Telegram market: it filters by model/symbol/backdrop itself.
  // A search naming only collections goes deeper into them instead; one with only price/monochrome/digits
  // can't be searched market-wide and stays with the cheapest listings above.
  let calls = 0;
  const attributes = new Map();
  const before = items.length;
  for (const s of searches.filter(s => onMarket(s, 'Telegram'))) {
    const byAttribute = s.filter.models?.length || s.filter.symbols?.length || s.filter.backdrops?.length;
    if (!byAttribute && !s.filter.names?.length) continue;
    for (const title of s.filter.names?.length ? s.filter.names : Object.keys(giftIds)) {
      if (!giftIds[title] || calls >= MAX_SEARCH_CALLS) continue;
      const params = { giftId: giftIds[title] };
      let want = DEEP_COLLECTION;
      if (byAttribute) {
        if (!attributes.has(title)) {
          attributes.set(title, (await resale(call, { giftId: giftIds[title], attributesHash: Long.ZERO }, 1)).attributes ?? []);
          calls++;
        }
        params.attributes = attributeIds(attributes.get(title), s.filter);
        if (!params.attributes) continue; // it names a model/symbol/backdrop this collection doesn't have
        want = PER_SEARCH;
      }
      calls += Math.ceil(want / 100);
      const { gifts, count } = await resale(call, params, want);
      const was = items.length;
      gifts.forEach(g => add(fromTelegram(g)));
      console.log(`  ${title}: ${gifts.length} of ${count} on sale, ${items.length - was} new`);
    }
  }
  console.log(`Saved searches, whole Telegram market: ${items.length - before} more gifts (${calls} calls)`);

  // MRKT is a bonus: if it is down or changed its API, the Telegram listings still get published.
  try {
    const token = await mrktLogin(client, call);
    const start = items.length;
    for (const collection of Object.keys(counts)) (await mrktSearch(token, { collectionNames: [collection] }, MRKT_PAGES)).forEach(m => add(fromMrkt(m)));
    for (const s of searches.filter(s => onMarket(s, 'MRKT'))) {
      const query = mrktQuery(s.filter);
      if (query) (await mrktSearch(token, query, PER_SEARCH / 20)).forEach(m => add(fromMrkt(m)));
    }
    console.log(`MRKT: ${items.length - start} gifts`);
  } catch (e) {
    console.error(`MRKT skipped: ${e.message}`);
  }
  await client.destroy();

  const mono = readJson('mono-cache.json', {});
  const todo = items.filter(i => mono[i.slug] === undefined && i.center != null);
  const until = Date.now() + MONO_BUDGET_MS;
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < todo.length && Date.now() < until) {
      const i = todo[next++];
      // One unreadable picture only costs that gift its monochrome mark; it is retried next run.
      try { mono[i.slug] = await fetchIsMonochrome(i.slug, i.center, i.edge); } catch (e) { console.error(`Mono ${i.slug}: ${e.message}`); }
    }
  }));
  // Keep only gifts still on sale, so the cache doesn't grow forever.
  writeJson('mono-cache.json', Object.fromEntries(items.filter(i => i.slug in mono).map(i => [i.slug, mono[i.slug]])));
  console.log(`Monochrome check: ${Math.min(next, todo.length)} new of ${todo.length} unchecked`);
  const out = items.map(i => ({ ...i.gift, is_monochrome: mono[i.slug] === true }));

  // Without the previous run's list (first run, lost cache) everything would look new and flood the alerts,
  // so that run only sets the baseline.
  const prev = readJson('docs/gifts.json', null) ?? out;
  writeJson('seen.json', stampSeen(out, readJson('seen.json', {}), Math.floor(Date.now() / 1000)));
  writeJson('docs/gifts.json', out);
  writeJson('docs/stats.json', counts);
  console.log(`Saved ${out.length} gifts (${onResale.length} collections)`);

  if (process.env.TG_BOT_TOKEN) {
    // A broken bot token must not stop the fresh gifts from being published.
    try {
      const store = readJson('alerts.json', { offset: 0, owner: null, alerts: [] });
      const username = await runAlerts({ token: process.env.TG_BOT_TOKEN, store, prev, next: out, searches, siteUrl: process.env.SITE_URL });
      writeJson('alerts.json', store, true);
      writeJson('docs/bot.json', { username });
    } catch (e) {
      console.error(`Alerts skipped: ${e.message}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
