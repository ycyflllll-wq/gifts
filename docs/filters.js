// Shared by the browser (globals) and the Node test (module.exports).
const isFewDigits = id => new Set(String(id).replace(/\D/g, '')).size <= 3;

// An empty list means "any value".
const pick = (list, value) => !list?.length || list.includes(value);

function filterGifts(gifts, { mono, fewDigits, query, models, backdrops, symbols, priceMin, priceMax }) {
  const q = (query ?? '').trim().toLowerCase().replace(/^#/, '');
  return gifts.filter(g =>
    (!mono || g.is_monochrome === true || g.color_type === 'monochrome') &&
    (!fewDigits || isFewDigits(g.id)) &&
    pick(models, g.model) && pick(backdrops, g.backdrop) && pick(symbols, g.symbol) &&
    (priceMin == null || g.price >= priceMin) &&
    (priceMax == null || g.price <= priceMax) &&
    (!q || g.name.toLowerCase().includes(q) || String(g.id).includes(q)));
}

if (typeof module !== 'undefined') module.exports = { isFewDigits, filterGifts };
