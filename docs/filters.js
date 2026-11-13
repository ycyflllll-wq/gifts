// Shared by the browser (globals) and the Node test (module.exports).
const isFewDigits = id => new Set(String(id).replace(/\D/g, '')).size <= 3;

// An empty list means "any value".
const pick = (list, value) => !list?.length || list.includes(value);

function filterGifts(gifts, { mono, fewDigits, query, names, models, backdrops, symbols, markets, priceMin, priceMax }) {
  const q = (query ?? '').trim().toLowerCase().replace(/^#/, '');
  return gifts.filter(g =>
    (!mono || g.is_monochrome === true || g.color_type === 'monochrome') &&
    (!fewDigits || isFewDigits(g.id)) &&
    pick(names, g.name) && pick(models, g.model) && pick(backdrops, g.backdrop) && pick(symbols, g.symbol) &&
    pick(markets, g.market) &&
    (priceMin == null || g.price >= priceMin) &&
    (priceMax == null || g.price <= priceMax) &&
    (!q || g.name.toLowerCase().includes(q) || String(g.id).includes(q)));
}

// Human-readable summary of a filter, e.g. "Колекція: Plush Pepe; Ціна: 0–100".
function describe(f) {
  const labels = { names: 'Колекція', models: 'Модель', backdrops: 'Фон', symbols: 'Символ', markets: 'Маркет' };
  const parts = [];
  for (const k of Object.keys(labels)) if (f[k]?.length) parts.push(`${labels[k]}: ${f[k].join(', ')}`);
  if (f.priceMin != null || f.priceMax != null) parts.push(`Ціна: ${f.priceMin ?? 0}–${f.priceMax ?? '∞'}`);
  if (f.mono) parts.push('Монохромні');
  if (f.fewDigits) parts.push('≤ 3 цифри');
  if (f.query?.trim()) parts.push(`Пошук: ${f.query.trim()}`);
  return parts.join('; ');
}

if (typeof module !== 'undefined') module.exports = { isFewDigits, filterGifts, describe };
