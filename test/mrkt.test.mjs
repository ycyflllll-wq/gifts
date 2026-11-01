import test from 'node:test';
import assert from 'node:assert';
import { mrktToGift, MRKT_URL } from '../scripts/mrkt.mjs';

test('mrktToGift maps an MRKT listing (shape as returned by /gifts/saling)', () => {
  const listing = {
    name: 'ChillFlame-153551', number: 153551, title: 'Chill Flame', collectionTitle: 'Chill Flame',
    modelName: 'Carousel', modelTitle: 'Carousel', modelRarityPerMille: 20,
    backdropName: 'Tactical Pine', backdropRarityPerMille: 12, backdropColorsCenterColor: 4489835, backdropColorsEdgeColor: 3105641,
    symbolName: 'Acorn', symbolRarityPerMille: null, salePrice: 3865190040,
  };
  assert.deepStrictEqual(mrktToGift(listing), {
    id: 153551, name: 'Chill Flame', model: 'Carousel', backdrop: 'Tactical Pine', symbol: 'Acorn',
    model_rarity: '2%', backdrop_rarity: '1.2%', symbol_rarity: undefined,
    backdrop_colors: ['#44826b', '#2f6369'], price: 3.86519004, currency: 'TON', is_monochrome: false,
    market: 'MRKT', image: 'https://nft.fragment.com/gift/chillflame-153551.webp', url: MRKT_URL,
  });
});
