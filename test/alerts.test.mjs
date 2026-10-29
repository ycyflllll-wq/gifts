import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { applyCommands, alertMessages, cleanFilter, freshListings } from '../scripts/alerts.mjs';

const gifts = createRequire(import.meta.url)('./fixtures/gifts.json');
const OWNER = 42;
const msg = (text, from = OWNER, update_id = 1) => ({ update_id, message: { text, from: { id: from }, chat: { id: from } } });
const newStore = () => ({ offset: 0, owner: null, alerts: [] });

test('freshListings: new or cheaper only', () => {
  const [a, b, c] = gifts;
  assert.deepStrictEqual(freshListings([a, b], [a, { ...b, price: b.price - 1 }, c]).map(g => g.id), [b.id, c.id]);
  assert.deepStrictEqual(freshListings([a], [{ ...a, price: a.price + 1 }]), []);
});

test('cleanFilter keeps only known, well-typed fields', () => {
  assert.deepStrictEqual(cleanFilter({ names: ['Lol Pop', 5], priceMax: 10, mono: true, evil: 'x', priceMin: -1 }), { names: ['Lol Pop'], priceMax: 10, mono: true });
  assert.strictEqual(cleanFilter({}), null);
  assert.strictEqual(cleanFilter([1]), null);
  assert.strictEqual(cleanFilter('x'), null);
});

test('/alert, /alerts, /stop and owner lock', () => {
  const store = newStore();
  const replies = applyCommands(store, [
    msg('/alert {"backdrops":["Onyx Black"],"priceMax":5}', OWNER, 10),
    msg('/alert {"names":["Toy Bear"]}', 7, 11),
    msg('/alert not json', OWNER, 12),
    msg('/alerts', OWNER, 13),
  ], gifts);
  assert.strictEqual(store.owner, OWNER);
  assert.strictEqual(store.offset, 14);
  assert.deepStrictEqual(store.alerts, [{ id: 1, chat: OWNER, filter: { backdrops: ['Onyx Black'], priceMax: 5 } }]);
  assert.match(replies[0].text, /Сповіщення #1.*\n.*лотів: 1/); // only Lol Pop (4.5 TON) is Onyx Black under 5
  assert.strictEqual(replies[1].text, 'Це приватний бот.');
  assert.match(replies[2].text, /Не зрозумів/);
  assert.match(replies[3].text, /#1: Фон: Onyx Black; Ціна: 0–5/);

  applyCommands(store, [msg('/stop 1', OWNER, 14)], gifts);
  assert.deepStrictEqual(store.alerts, []);
});

test('alertMessages notifies only matching fresh listings', () => {
  const store = { ...newStore(), owner: OWNER, alerts: [{ id: 3, chat: OWNER, filter: { names: ['Lol Pop'] } }] };
  assert.deepStrictEqual(alertMessages(store, gifts.filter(g => g.name !== 'Lol Pop')), []);
  const [m] = alertMessages(store, gifts);
  assert.strictEqual(m.chat, OWNER);
  assert.match(m.text, /🔔 #3 \(Колекція: Lol Pop\)\n\nLol Pop #3133 — 4.5 TON\nhttps:\/\/t.me\/nft\/LolPop-3133/);
});
