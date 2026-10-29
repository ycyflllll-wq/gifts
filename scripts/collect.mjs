// Collects collectible gifts listed for resale on Telegram's own market into docs/gifts.json.
// Run: node --env-file=.env scripts/collect.mjs  (GitHub Actions passes the same vars as secrets)
import { TelegramClient, MemoryStorage } from '@mtcute/node';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// shortcut: only the cheapest listings per collection, so the page stays light; add paging when more is needed.
const PER_COLLECTION = 50;

const hex = n => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
// "Monochrome" = black/white/grey backdrop: its centre colour has almost no saturation.
const isGray = n => {
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255];
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
};

export function toGift(g) {
  const attr = type => g.attributes.find(a => a._ === type);
  const backdrop = attr('starGiftAttributeBackdrop');
  const ton = g.resellAmount?.find(a => a._ === 'starsTonAmount');
  const stars = g.resellAmount?.find(a => a._ === 'starsAmount');
  return {
    id: g.num,
    name: g.title,
    model: attr('starGiftAttributeModel')?.name,
    backdrop: backdrop?.name,
    symbol: attr('starGiftAttributePattern')?.name,
    backdrop_colors: backdrop && [hex(backdrop.centerColor), hex(backdrop.edgeColor)],
    ...(ton ? { price: Number(String(ton.amount)) / 1e9, currency: 'TON' } : { price: Number(String(stars?.amount ?? 0)), currency: 'XTR' }),
    is_monochrome: backdrop ? isGray(backdrop.centerColor) : false,
    market: 'Telegram',
    image: `https://nft.fragment.com/gift/${g.slug.toLowerCase()}.webp`,
    url: `https://t.me/nft/${g.slug}`,
  };
}

async function main() {
  const client = new TelegramClient({
    apiId: Number(process.env.TG_API_ID),
    apiHash: process.env.TG_API_HASH,
    storage: new MemoryStorage(),
  });
  await client.start({ session: process.env.TG_SESSION });

  const { gifts: bases } = await client.call({ _: 'payments.getStarGifts', hash: 0 });
  const onResale = bases.filter(b => b._ === 'starGift' && Number(String(b.availabilityResale ?? 0)) > 0);

  const out = [];
  for (const base of onResale) {
    const res = await client.call({ _: 'payments.getResaleStarGifts', giftId: base.id, sortByPrice: true, offset: '', limit: PER_COLLECTION });
    out.push(...res.gifts.filter(g => g._ === 'starGiftUnique' && g.resellAmount?.length).map(toGift));
  }
  await client.close();

  if (!out.length) throw new Error('No gifts collected — keeping the previous gifts.json');
  writeFileSync(new URL('../docs/gifts.json', import.meta.url), JSON.stringify(out));
  console.log(`Saved ${out.length} gifts from ${onResale.length} collections`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
