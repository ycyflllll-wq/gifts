// Collects collectible gifts listed for resale on Telegram's own market into docs/gifts.json,
// then lets the bot handle alert commands and notify about new matching listings (scripts/alerts.mjs).
// Run: node --env-file=.env scripts/collect.mjs  (GitHub Actions passes the same vars as secrets)
import { TelegramClient, MemoryStorage } from '@mtcute/node';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runAlerts } from './alerts.mjs';

// shortcut: only the cheapest listings per collection, so the page stays light; add paging when more is needed.
const PER_COLLECTION = 50;
// The owner forbade any purchases from their account, so the client may only call these read methods.
const READ_ONLY = new Set(['payments.getStarGifts', 'payments.getResaleStarGifts']);

const file = p => new URL(`../${p}`, import.meta.url);
const readJson = (p, fallback) => existsSync(file(p)) ? JSON.parse(readFileSync(file(p), 'utf8')) : fallback;
const writeJson = (p, data, pretty) => writeFileSync(file(p), JSON.stringify(data, null, pretty ? 2 : 0) + '\n');

const hex = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
// "Monochrome" = black/white/grey backdrop: its centre colour has almost no saturation.
const isGray = n => {
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
};
const rarity = r => !r ? undefined : r._ === 'starGiftAttributeRarity' ? `${r.permille / 10}%` : r._.replace('starGiftAttributeRarity', '');

export function toGift(g) {
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
    is_monochrome: backdrop ? isGray(backdrop.centerColor) : false,
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
    return client.call(req);
  };
  await client.start({ session: process.env.TG_SESSION });

  const { gifts: bases } = await call({ _: 'payments.getStarGifts', hash: 0 });
  const onResale = bases.filter(b => b._ === 'starGift' && Number(String(b.availabilityResale ?? 0)) > 0);

  const out = [];
  const counts = {};
  for (const base of onResale) {
    const res = await call({ _: 'payments.getResaleStarGifts', giftId: base.id, sortByPrice: true, offset: '', limit: PER_COLLECTION });
    const listed = res.gifts.filter(g => g._ === 'starGiftUnique' && g.resellAmount?.length).map(toGift);
    if (listed.length) counts[listed[0].name] = res.count;
    out.push(...listed);
  }
  await client.close();
  if (!out.length) throw new Error('No gifts collected — keeping the previous gifts.json');

  const prev = readJson('docs/gifts.json', []);
  writeJson('docs/gifts.json', out);
  writeJson('docs/stats.json', counts);
  console.log(`Saved ${out.length} gifts from ${onResale.length} collections`);

  if (process.env.TG_BOT_TOKEN) {
    // A broken bot token must not stop the fresh gifts from being published.
    try {
      const store = readJson('alerts.json', { offset: 0, owner: null, alerts: [] });
      const username = await runAlerts({ token: process.env.TG_BOT_TOKEN, store, prev, next: out });
      writeJson('alerts.json', store, true);
      writeJson('docs/bot.json', { username });
    } catch (e) {
      console.error(`Alerts skipped: ${e.message}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
