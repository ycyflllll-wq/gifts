import test from 'node:test';
import assert from 'node:assert';
import { normalizePhone } from '../scripts/phone.mjs';

test('normalizePhone adds the Ukrainian code when it is missing', () => {
  for (const raw of ['681234567', '0681234567', '380681234567', '+380 68 123 45 67', '+38 (068) 123-45-67']) {
    assert.strictEqual(normalizePhone(raw), '+380681234567', raw);
  }
  assert.strictEqual(normalizePhone('+48 512 345 678'), '+48512345678'); // foreign numbers stay as typed
});
