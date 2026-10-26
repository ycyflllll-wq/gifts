// Shared by the browser (globals) and the Node test (module.exports).
const isFewDigits = id => new Set(String(id).replace(/\D/g, '')).size <= 3;

function filterGifts(gifts, { mono, fewDigits, query }) {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  return gifts.filter(g =>
    (!mono || g.is_monochrome === true || g.color_type === 'monochrome') &&
    (!fewDigits || isFewDigits(g.id)) &&
    (!q || g.name.toLowerCase().includes(q) || String(g.id).includes(q)));
}

if (typeof module !== 'undefined') module.exports = { isFewDigits, filterGifts };
