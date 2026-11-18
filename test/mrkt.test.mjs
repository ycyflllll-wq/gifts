import test from 'node:test';
import assert from 'node:assert';
import { mrktToGift, mrktGiftUrl, MRKT_URL } from '../scripts/mrkt.mjs';

test('mrktGiftUrl matches the link from MRKT\'s own Share button', () => {
  // Shared from the MRKT app: https://t.me/mrkt/app?startapp=f48eb5b66d8743e5846d557a764c7634
  assert.strictEqual(mrktGiftUrl('f48eb5b6-6d87-43e5-846d-557a764c7634'), 'https://t.me/mrkt/app?startapp=f48eb5b66d8743e5846d557a764c7634');
  assert.strictEqual(mrktGiftUrl(undefined), MRKT_URL);
});

test('mrktToGift maps an MRKT listing (shape as returned by /gifts/saling)', () => {
  const listing = {
    id: '12872f10-efd2-4c66-8592-ac7691f3bf55',
    name: 'ChillFlame-153551', number: 153551, title: 'Chill Flame', collectionTitle: 'Chill Flame',
    modelName: 'Carousel', modelTitle: 'Carousel', modelRarityPerMille: 20,
    backdropName: 'Tactical Pine', backdropRarityPerMille: 12, backdropColorsCenterColor: 4489835, backdropColorsEdgeColor: 3105641,
    symbolName: 'Acorn', symbolRarityPerMille: null, salePrice: 3865190040,
  };
  assert.deepStrictEqual(mrktToGift(listing), {
    id: 153551, name: 'Chill Flame', model: 'Carousel', backdrop: 'Tactical Pine', symbol: 'Acorn',
    model_rarity: '2%', backdrop_rarity: '1.2%', symbol_rarity: undefined,
    backdrop_colors: ['#44826b', '#2f6369'], price: 3.86519004, currency: 'TON', is_monochrome: false,
    market: 'MRKT', image: 'https://nft.fragment.com/gift/chillflame-153551.webp',
    url: 'https://t.me/mrkt/app?startapp=12872f10efd24c668592ac7691f3bf55',
  });
});

test('mrktQuery: a saved filter as MRKT filters, or null when it names nothing MRKT filters by', async () => {
  const { mrktQuery } = await import('../scripts/mrkt.mjs');
  assert.deepStrictEqual(mrktQuery({ names: ['Plush Pepe'], backdrops: ['Black'], priceMax: 1.5 }), {
    collectionNames: ['Plush Pepe'], modelNames: [], backdropNames: ['Black'], symbolNames: [], minPrice: null, maxPrice: 1500000000,
  });
  assert.strictEqual(mrktQuery({ mono: true, priceMax: 5 }), null);
});
