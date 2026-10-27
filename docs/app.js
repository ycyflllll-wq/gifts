const tg = window.Telegram?.WebApp;
const state = { mono: false, fewDigits: false, query: '', models: [], backdrops: [], symbols: [], priceMin: null, priceMax: null };
const SHEETS = { models: 'Модель', backdrops: 'Фон', symbols: 'Символ', price: 'Ціна' };
const FIELD = { models: 'model', backdrops: 'backdrop', symbols: 'symbol' };
let gifts = [];
let openSheet = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const isColor = c => /^#[0-9a-f]{3,8}$/i.test(c);
const swatch = ([c1, c2] = []) => isColor(c1) && isColor(c2) ? `--c1:${c1};--c2:${c2}` : '';
const fmt = n => Number(n).toLocaleString('uk-UA');
const plural = n => ({ one: 'подарунок', few: 'подарунки' })[new Intl.PluralRules('uk').select(n)] ?? 'подарунків';
const TON = '<svg class="ton" viewBox="0 0 24 24" aria-label="TON"><path d="M12 21 3.6 6.6A1 1 0 0 1 4.5 5h15a1 1 0 0 1 .9 1.6L12 21Zm0 0V5"/></svg>';

const isActive = key => key === 'price' ? state.priceMin != null || state.priceMax != null : state[key].length > 0;
const anyFilter = () => state.mono || state.fewDigits || state.query.trim() || Object.keys(SHEETS).some(isActive);

function chipLabel(key) {
  if (key === 'price') return isActive(key) ? `Ціна · ${state.priceMin ?? 0}–${state.priceMax ?? '∞'}` : 'Ціна';
  return isActive(key) ? `${SHEETS[key]} · ${state[key].length}` : SHEETS[key];
}

function applyTheme() {
  document.documentElement.dataset.theme = tg?.colorScheme ?? 'light';
  // Paint Telegram's own header to match the page, like a native app.
  if (tg?.isVersionAtLeast('6.1')) {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
  }
}

const card = g => `
  <a class="card" href="${esc(g.url)}" target="_blank" rel="noopener" title="${esc(`${g.model ?? ''} · ${g.backdrop ?? ''} · ${g.symbol ?? ''}`)}">
    <div class="thumb" style="${swatch(g.backdrop_colors)}">
      <img src="${esc(g.image)}" alt="${esc(g.name)}" loading="lazy" onerror="this.remove()">
    </div>
    <div class="info"><span class="name">${esc(g.name)}</span><span class="num">#${esc(g.id)}</span></div>
    <div class="buy">${TON}${esc(fmt(g.price))}</div>
  </a>`;

function render() {
  const list = filterGifts(gifts, state);
  $('#count').textContent = `${list.length} з ${gifts.length}`;
  $('#grid').innerHTML = list.map(card).join('') || '<p class="empty">Нічого не знайдено</p>';

  document.querySelectorAll('[data-sheet]').forEach(chip => {
    chip.textContent = chipLabel(chip.dataset.sheet);
    chip.classList.toggle('on', isActive(chip.dataset.sheet));
  });
  $('#reset').hidden = !anyFilter();
  $('#sheet-done').textContent = `Показати ${list.length} ${plural(list.length)}`;

  if (anyFilter() && list.length) {
    tg?.MainButton.setText(`Показати ${list.length} ${plural(list.length)}`).show();
  } else {
    tg?.MainButton.hide();
  }
}

function renderSheet() {
  const key = openSheet;
  if (key === 'price') {
    $('#sheet-body').innerHTML = `<div class="price-row">
      <label>Від, TON<input type="number" inputmode="decimal" min="0" step="any" data-price="priceMin" value="${state.priceMin ?? ''}"></label>
      <label>До, TON<input type="number" inputmode="decimal" min="0" step="any" data-price="priceMax" value="${state.priceMax ?? ''}"></label>
    </div>`;
    return;
  }

  // Each value with how many gifts have it, plus one gift to borrow a picture/colors from.
  const opts = new Map();
  for (const g of gifts) {
    const v = g[FIELD[key]];
    if (v) opts.set(v, { n: (opts.get(v)?.n ?? 0) + 1, g: opts.get(v)?.g ?? g });
  }
  const q = $('#sheet-search').value.trim().toLowerCase();
  $('#sheet-body').innerHTML = [...opts]
    .filter(([v]) => v.toLowerCase().includes(q))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([v, { n, g }]) => `
      <label class="opt">
        ${key === 'models' ? `<span class="opt-img thumb" style="${swatch(g.backdrop_colors)}"><img src="${esc(g.image)}" alt="" loading="lazy" onerror="this.remove()"></span>` : ''}
        ${key === 'backdrops' ? `<span class="dot thumb" style="${swatch(g.backdrop_colors)}"></span>` : ''}
        <span class="opt-name">${esc(v)}${key === 'models' ? `<small>${esc(g.name)}</small>` : ''}</span>
        <span class="opt-count">${n}</span>
        <input type="checkbox" value="${esc(v)}" ${state[key].includes(v) ? 'checked' : ''}>
      </label>`).join('') || '<p class="empty">Нічого не знайдено</p>';
}

function showSheet(key) {
  openSheet = key;
  $('#sheet-title').textContent = SHEETS[key];
  $('#sheet-search').value = '';
  $('#sheet-search').hidden = key === 'price';
  renderSheet();
  $('#sheet').showModal();
  tg?.BackButton.show();
}

document.querySelectorAll('[data-sheet]').forEach(chip => chip.addEventListener('click', () => showSheet(chip.dataset.sheet)));

document.querySelectorAll('[data-filter]').forEach(chip => chip.addEventListener('click', () => {
  const key = chip.dataset.filter;
  state[key] = !state[key];
  chip.setAttribute('aria-pressed', state[key]);
  tg?.HapticFeedback.selectionChanged();
  render();
}));

$('#reset').addEventListener('click', () => {
  Object.assign(state, { mono: false, fewDigits: false, query: '', models: [], backdrops: [], symbols: [], priceMin: null, priceMax: null });
  document.querySelectorAll('[data-filter]').forEach(chip => chip.setAttribute('aria-pressed', false));
  $('#search').value = '';
  tg?.HapticFeedback.impactOccurred('light');
  render();
});

$('#search').addEventListener('input', e => { state.query = e.target.value; render(); });
$('#sheet-search').addEventListener('input', renderSheet);

$('#sheet-body').addEventListener('change', e => {
  if (e.target.type !== 'checkbox') return;
  const list = state[openSheet];
  e.target.checked ? list.push(e.target.value) : list.splice(list.indexOf(e.target.value), 1);
  tg?.HapticFeedback.selectionChanged();
  render();
});

$('#sheet-body').addEventListener('input', e => {
  const key = e.target.dataset.price;
  if (!key) return;
  const v = e.target.valueAsNumber;
  state[key] = Number.isNaN(v) ? null : v;
  render();
});

$('#sheet-clear').addEventListener('click', () => {
  if (openSheet === 'price') Object.assign(state, { priceMin: null, priceMax: null });
  else state[openSheet] = [];
  tg?.HapticFeedback.impactOccurred('light');
  renderSheet();
  render();
});

// Tapping the dimmed area outside the sheet closes it.
$('#sheet').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#sheet').addEventListener('close', () => { openSheet = null; tg?.BackButton.hide(); });
tg?.BackButton.onClick(() => $('#sheet').close());

// Inside Telegram, t.me links must go through the SDK to open natively instead of in a browser tab.
$('#grid').addEventListener('click', e => {
  const link = e.target.closest('.card');
  if (!link || !tg?.initData) return;
  e.preventDefault();
  link.href.startsWith('https://t.me/') ? tg.openTelegramLink(link.href) : tg.openLink(link.href);
});

tg?.MainButton.onClick(() => {
  tg.HapticFeedback.impactOccurred('medium');
  if ($('#sheet').open) return $('#sheet').close();
  $('#search').blur(); // hides the mobile keyboard
  $('#grid').scrollIntoView({ behavior: 'smooth' });
});

tg?.ready();
tg?.expand();
applyTheme();
tg?.onEvent('themeChanged', applyTheme);

fetch('gifts.json') // static file, so docs/ also works on GitHub Pages without the server
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(data => { gifts = data; render(); })
  .catch(() => { $('#grid').innerHTML = '<p class="empty">Не вдалося завантажити подарунки</p>'; });
