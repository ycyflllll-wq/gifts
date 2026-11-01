// MRKT marketplace (@mrkt), through the unofficial API its own mini app uses. Read-only: it logs in by opening
// the mini app as the user (like tapping "Open" in Telegram) and only lists gifts that are for sale.
const API = 'https://api.tgmrkt.io/api/v1';
const HEADERS = {
  'content-type': 'application/json',
  origin: 'https://cdn.tgmrkt.io',
  referer: 'https://cdn.tgmrkt.io/',
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
};
// shortcut: MRKT returns at most 20 per request, so only the cheapest 20 per collection; page with `cursor` for more.
const SEARCH = {
  collectionNames: [], modelNames: [], backdropNames: [], symbolNames: [], ordering: 'Price', lowToHigh: true,
  maxPrice: null, minPrice: null, mintable: null, number: null, count: 20, cursor: '', query: null, promotedFirst: false,
};
// No per-gift link format is published, so "Buy" opens MRKT itself.
export const MRKT_URL = 'https://t.me/mrkt/app';

const hex = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const perMille = n => n == null ? undefined : `${n / 10}%`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// call: the collector's read-only Telegram call (it must allow messages.requestAppWebView).
export async function mrktLogin(client, call) {
  const bot = await client.resolveUser('mrkt');
  const view = await call({
    _: 'messages.requestAppWebView',
    peer: { _: 'inputPeerUser', userId: bot.userId, accessHash: bot.accessHash },
    app: { _: 'inputBotAppShortName', botId: bot, shortName: 'app' },
    platform: 'android',
  });
  const initData = new URLSearchParams(new URL(view.url).hash.slice(1)).get('tgWebAppData');
  const res = await fetch(`${API}/auth`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ data: initData }) });
  if (!res.ok) throw new Error(`MRKT login: HTTP ${res.status}`);
  const { token } = await res.json();
  if (!token) throw new Error('MRKT login: no token');
  return token;
}

export async function mrktListings(token, collection) {
  const headers = { ...HEADERS, authorization: token, cookie: `access_token=${token}` };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/gifts/saling`, { method: 'POST', headers, body: JSON.stringify({ ...SEARCH, collectionNames: [collection] }) });
    if (res.status === 429 && attempt < 3) { await sleep(5000 * (attempt + 1)); continue; } // rate limited: back off
    if (!res.ok) throw new Error(`MRKT ${collection}: HTTP ${res.status}`);
    return (await res.json()).gifts ?? [];
  }
}

export function mrktToGift(m) {
  return {
    id: m.number,
    name: m.collectionTitle ?? m.title,
    model: m.modelTitle ?? m.modelName,
    backdrop: m.backdropName,
    symbol: m.symbolName,
    model_rarity: perMille(m.modelRarityPerMille),
    backdrop_rarity: perMille(m.backdropRarityPerMille),
    symbol_rarity: perMille(m.symbolRarityPerMille),
    backdrop_colors: m.backdropColorsCenterColor == null ? undefined : [hex(m.backdropColorsCenterColor), hex(m.backdropColorsEdgeColor)],
    price: m.salePrice / 1e9, // what the buyer pays, MRKT's fee included
    currency: 'TON',
    is_monochrome: false,
    market: 'MRKT',
    image: `https://nft.fragment.com/gift/${m.name.toLowerCase()}.webp`,
    url: MRKT_URL,
  };
}
