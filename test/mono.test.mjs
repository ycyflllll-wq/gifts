import test from 'node:test';
import assert from 'node:assert';
import { isMonochromeImage } from '../scripts/mono.mjs';

const SIZE = 40;
// A backdrop-coloured square picture with a blob of `model` colour in the middle (a quarter of the centre).
function picture(backdrop, model, detail) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inModel = x >= 14 && x < 26 && y >= 14 && y < 26;
      const inDetail = detail && x >= 14 && x < 26 && y >= 14 && y < 17;
      const c = inDetail ? detail : inModel ? model : backdrop;
      data.set([c >> 16 & 255, c >> 8 & 255, c & 255, 255], (y * SIZE + x) * 4);
    }
  }
  return { data, width: SIZE, height: SIZE };
}

const SHAMROCK = 0x8ab163, SHAMROCK_EDGE = 0x559345, BLACK = 0x363738, BLACK_EDGE = 0x0e0f0f;

test('green model on a green backdrop is monochrome', () => {
  assert.ok(isMonochromeImage(picture(SHAMROCK, 0x3fd14a), SHAMROCK, SHAMROCK_EDGE));
});

test('a red part on a green model rules it out', () => {
  assert.ok(!isMonochromeImage(picture(SHAMROCK, 0x3fd14a, 0xe8401c), SHAMROCK, SHAMROCK_EDGE));
});

test('a silver model on a green backdrop is not monochrome', () => {
  assert.ok(!isMonochromeImage(picture(SHAMROCK, 0xd8dadc), SHAMROCK, SHAMROCK_EDGE));
});

test('black & white on the Black backdrop is monochrome, a coloured model is not', () => {
  assert.ok(isMonochromeImage(picture(BLACK, 0xeeeeee), BLACK, BLACK_EDGE));
  assert.ok(!isMonochromeImage(picture(BLACK, 0x2a7de1), BLACK, BLACK_EDGE));
});
