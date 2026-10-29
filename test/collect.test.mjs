import test from 'node:test';
import assert from 'node:assert';
import { toGift } from '../scripts/collect.mjs';

const unique = (resellAmount, centerColor = 0x4d5254) => ({
  _: 'starGiftUnique', title: 'Lol Pop', slug: 'LolPop-3133', num: 3133, resellAmount,
  attributes: [
    { _: 'starGiftAttributeModel', name: 'Mandarin' },
    { _: 'starGiftAttributePattern', name: 'Kudu Totem' },
    { _: 'starGiftAttributeBackdrop', name: 'Onyx Black', centerColor, edgeColor: 0x313638 },
  ],
});

test('toGift maps a Telegram resale listing', () => {
  assert.deepStrictEqual(toGift(unique([{ _: 'starsAmount', amount: 900n }, { _: 'starsTonAmount', amount: 4500000000n }])), {
    id: 3133, name: 'Lol Pop', model: 'Mandarin', backdrop: 'Onyx Black', symbol: 'Kudu Totem',
    backdrop_colors: ['#4d5254', '#313638'], price: 4.5, currency: 'TON', is_monochrome: true, market: 'Telegram',
    image: 'https://nft.fragment.com/gift/lolpop-3133.webp', url: 'https://t.me/nft/LolPop-3133',
  });
});

test('toGift falls back to Stars and detects colourful backdrops', () => {
  const g = toGift(unique([{ _: 'starsAmount', amount: 900n }], 0xbe6f54));
  assert.strictEqual(g.price, 900);
  assert.strictEqual(g.currency, 'XTR');
  assert.strictEqual(g.is_monochrome, false);
});
