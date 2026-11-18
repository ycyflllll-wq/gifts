import test from 'node:test';
import assert from 'node:assert';
import { toGift } from '../scripts/collect.mjs';

const unique = (resellAmount, centerColor = 0x4d5254) => ({
  _: 'starGiftUnique', title: 'Lol Pop', slug: 'LolPop-3133', num: 3133, resellAmount,
  attributes: [
    { _: 'starGiftAttributeModel', name: 'Mandarin', rarity: { _: 'starGiftAttributeRarity', permille: 15 } },
    { _: 'starGiftAttributePattern', name: 'Kudu Totem' },
    { _: 'starGiftAttributeBackdrop', name: 'Onyx Black', centerColor, edgeColor: 0x313638, rarity: { _: 'starGiftAttributeRarityRare' } },
  ],
});

test('toGift maps a Telegram resale listing', () => {
  assert.deepStrictEqual(toGift(unique([{ _: 'starsAmount', amount: 900n }, { _: 'starsTonAmount', amount: 4500000000n }]), true), {
    id: 3133, name: 'Lol Pop', model: 'Mandarin', backdrop: 'Onyx Black', symbol: 'Kudu Totem',
    model_rarity: '1.5%', backdrop_rarity: 'Rare', symbol_rarity: undefined,
    backdrop_colors: ['#4d5254', '#313638'], price: 4.5, currency: 'TON', is_monochrome: true, market: 'Telegram',
    image: 'https://nft.fragment.com/gift/lolpop-3133.webp', url: 'https://t.me/nft/LolPop-3133',
  });
});

test("toGift falls back to Stars; not monochrome until checked", () => {
  const g = toGift(unique([{ _: 'starsAmount', amount: 900n }], 0xbe6f54));
  assert.strictEqual(g.price, 900);
  assert.strictEqual(g.currency, 'XTR');
  assert.strictEqual(g.is_monochrome, false);
});

test('stampSeen: first-seen times, a cold start is not "new", sold listings are dropped', async () => {
  const { stampSeen } = await import('../scripts/collect.mjs');
  const a = { market: 'Telegram', name: 'Lol Pop', id: 1 }, b = { ...a, id: 2 };
  const cold = stampSeen([a, b], {}, 100);
  assert.deepStrictEqual([a.seen, b.seen], [0, 0]);
  const c = { ...a, id: 3 };
  const warm = stampSeen([a, c], cold, 200);
  assert.deepStrictEqual([a.seen, c.seen], [0, 200]);
  assert.deepStrictEqual(Object.keys(warm), ['Telegram|Lol Pop|1', 'Telegram|Lol Pop|3']);
});

test('attributeIds turns a saved filter into Telegram attribute ids for one collection', async () => {
  const { attributeIds } = await import('../scripts/collect.mjs');
  const attrs = [
    { _: 'starGiftAttributeModel', name: 'Mandarin', document: { id: 11n } },
    { _: 'starGiftAttributeModel', name: 'Lemon', document: { id: 12n } },
    { _: 'starGiftAttributePattern', name: 'Kudu Totem', document: { id: 21n } },
    { _: 'starGiftAttributeBackdrop', name: 'Onyx Black', backdropId: 7 },
  ];
  assert.deepStrictEqual(attributeIds(attrs, { models: ['Mandarin', 'Not Here'], backdrops: ['Onyx Black'] }), [
    { _: 'starGiftAttributeIdModel', documentId: 11n },
    { _: 'starGiftAttributeIdBackdrop', backdropId: 7 },
  ]);
  assert.deepStrictEqual(attributeIds(attrs, { names: ['Lol Pop'] }), []); // nothing to filter by
  assert.strictEqual(attributeIds(attrs, { symbols: ['Owl'] }), null); // that symbol isn't in this collection
});

test('resale pages through next_offset up to the wanted count', async () => {
  const { resale } = await import('../scripts/collect.mjs');
  const listing = n => ({ _: 'starGiftUnique', num: n, resellAmount: [{}] });
  const pages = { '': { gifts: [listing(1), listing(2)], nextOffset: 'b', count: 9, attributes: ['a'] }, b: { gifts: [listing(3), { _: 'starGiftUnique', num: 4 }], nextOffset: 'c', count: 9 }, c: { gifts: [listing(5)], count: 9 } };
  const asked = [];
  const call = async req => { asked.push([req.offset, req.limit]); return pages[req.offset]; };
  const { gifts, count, attributes } = await resale(call, { giftId: 1 }, 4);
  assert.deepStrictEqual(gifts.map(g => g.num), [1, 2, 3, 5]); // #4 isn't for sale (no price) and is skipped
  assert.deepStrictEqual(asked, [['', 4], ['b', 2], ['c', 1]]);
  assert.deepStrictEqual([count, attributes], [9, ['a']]);
});
