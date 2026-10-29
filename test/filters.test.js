const test = require('node:test');
const assert = require('node:assert');
const { isFewDigits, filterGifts } = require('../docs/filters.js');
const gifts = require('./fixtures/gifts.json');

const all = { mono: false, fewDigits: false, query: '' };
const ids = state => filterGifts(gifts, { ...all, ...state }).map(g => g.id);

test('isFewDigits: at most 3 distinct digits', () => {
  for (const id of [7777, 1231, 5005, 88, '#1001']) assert.ok(isFewDigits(id), id);
  for (const id of [1234, 123456, 9876]) assert.ok(!isFewDigits(id), id);
});

test('filters combine', () => {
  assert.strictEqual(ids({}).length, gifts.length);
  assert.deepStrictEqual(ids({ mono: true, fewDigits: true }), [777, 5005, 3133, 2024, 7070]);
  assert.deepStrictEqual(ids({ query: '#5005' }), [5005]);
  assert.deepStrictEqual(ids({ query: 'pepe' }), [777]);
});

test('attribute and price filters', () => {
  assert.deepStrictEqual(ids({ backdrops: ['Onyx Black'] }), [3133, 2024]);
  assert.deepStrictEqual(ids({ backdrops: ['Onyx Black', 'Black'] }), [3133, 2024, 111]);
  assert.deepStrictEqual(ids({ symbols: ['Grape'] }), [1001]);
  assert.deepStrictEqual(ids({ names: ['Lol Pop', 'Toy Bear'] }), [3133, 111]);
  assert.deepStrictEqual(ids({ models: ['Mandarin'], backdrops: ['Black'] }), []);
  assert.deepStrictEqual(ids({ priceMin: 5, priceMax: 7 }), [4545, 2024, 1357]);
  assert.strictEqual(ids({ priceMin: 0 }).length, gifts.length);
  assert.deepStrictEqual(ids({ priceMax: 4, fewDigits: true }), [7070]);
});
