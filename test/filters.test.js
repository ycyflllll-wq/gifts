const test = require('node:test');
const assert = require('node:assert');
const { isFewDigits, filterGifts } = require('../docs/filters.js');
const gifts = require('../docs/gifts.json');

const all = { mono: false, fewDigits: false, query: '' };

test('isFewDigits: at most 3 distinct digits', () => {
  for (const id of [7777, 1231, 5005, 88, '#1001']) assert.ok(isFewDigits(id), id);
  for (const id of [1234, 123456, 9876]) assert.ok(!isFewDigits(id), id);
});

test('filters combine', () => {
  assert.strictEqual(filterGifts(gifts, all).length, gifts.length);
  const ids = filterGifts(gifts, { ...all, mono: true, fewDigits: true }).map(g => g.id);
  assert.deepStrictEqual(ids, [7777, 5005, 3133, 2024, 7070]);
  assert.deepStrictEqual(filterGifts(gifts, { ...all, query: '#5005' }).map(g => g.name), ['Signet Ring']);
  assert.deepStrictEqual(filterGifts(gifts, { ...all, query: 'pepe' }).map(g => g.id), [7777]);
});
