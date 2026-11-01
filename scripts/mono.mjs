// "Monochrome" gift = the model is the same colour as its backdrop. Judged from the gift's small picture,
// in the centre where the model stands: almost no coloured pixel may have another hue than the backdrop,
// and almost no grey/silver/black pixel may stand out from it (a silver model on green is not monochrome).
import jpeg from 'jpeg-js';

const OFF_HUE_MAX = 0.02; // off-colour pixels a monochrome gift may still have (edges, glints)
const STANDOUT_GREY_MAX = 0.12; // colourless pixels unlike the backdrop (outlines, highlights)

export function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// Hue ranges people call by one colour name; green spans far more degrees than orange.
const FAMILIES = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [165, 'green'], [195, 'cyan'], [255, 'blue'], [290, 'purple'], [345, 'pink'], [360, 'red']];
const family = h => FAMILIES.find(([max]) => h < max)[1];
const sameColour = (a, b) => family(a) === family(b) || Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= 20;
const rgb = n => [n >> 16 & 255, n >> 8 & 255, n & 255];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Shares of the picture's central half: off = coloured but another hue than the backdrop,
// greyStandout = colourless and clearly unlike the backdrop's centre and edge colours.
export function analyse({ data, width, height }, centerColor, edgeColor) {
  const centre = rgb(centerColor), edge = rgb(edgeColor);
  const [bh, bs] = hsl(...centre);
  const greyBackdrop = bs < 0.15;
  let off = 0, greyStandout = 0, total = 0;
  for (let y = height >> 2; y < height * 3 >> 2; y++) {
    for (let x = width >> 2; x < width * 3 >> 2; x++) {
      const i = (y * width + x) * 4;
      const p = [data[i], data[i + 1], data[i + 2]];
      const [h, s, l] = hsl(...p);
      total++;
      if (s < 0.3 || l < 0.15 || l > 0.9) {
        if (Math.min(dist(p, centre), dist(p, edge)) > 45) greyStandout++;
      } else if (greyBackdrop || !sameColour(h, bh)) {
        off++;
      }
    }
  }
  return { off: off / total, greyStandout: greyStandout / total };
}

export function isMonochromeImage(image, centerColor, edgeColor) {
  const { off, greyStandout } = analyse(image, centerColor, edgeColor);
  // On a black/white/grey backdrop a black-and-white model is monochrome, so only colour counts there.
  return off <= OFF_HUE_MAX && (hsl(...rgb(centerColor))[1] < 0.15 || greyStandout <= STANDOUT_GREY_MAX);
}

export async function fetchIsMonochrome(slug, centerColor, edgeColor) {
  const res = await fetch(`https://nft.fragment.com/gift/${slug.toLowerCase()}.small.jpg`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return isMonochromeImage(jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true }), centerColor, edgeColor);
}
