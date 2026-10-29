const tg = window.Telegram?.WebApp;
const EMPTY = () => ({ mono: false, fewDigits: false, query: '', names: [], models: [], backdrops: [], symbols: [], priceMin: null, priceMax: null });
const state = EMPTY();
const SHEETS = { names: 'Колекція', models: 'Модель', backdrops: 'Фон', symbols: 'Символ', price: 'Ціна' };
const FIELD = { names: 'name', models: 'model', backdrops: 'backdrop', symbols: 'symbol' };
const PAGE = 60; // cards added per scroll step
const MAX_OPTIONS = 200; // rows shown in a filter sheet before asking to search
const byCurrency = (a, b) => (a.currency === 'XTR') - (b.currency === 'XTR'); // TON and Stars prices can't be compared
const SORTS = [
  { label: '↑ Дешевші', cmp: (a, b) => byCurrency(a, b) || a.price - b.price },
  { label: '↓ Дорожчі', cmp: (a, b) => byCurrency(a, b) || b.price - a.price },
  { label: '# Номер', cmp: (a, b) => a.id - b.id },
];
let gifts = [];
let list = [];
let shown = 0;
let openSheet = null;
let sortIndex = 0;
let counts = {}; // total listings per collection, from stats.json
let botUsername = null; // from bot.json, written once the bot token is set

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const isColor = c => /^#[0-9a-f]{3,8}$/i.test(c);
const swatch = ([c1, c2] = []) => isColor(c1) && isColor(c2) ? `--c1:${c1};--c2:${c2}` : '';
const fmt = n => Number(n).toLocaleString('uk-UA');
const plural = n => ({ one: 'подарунок', few: 'подарунки' })[new Intl.PluralRules('uk').select(n)] ?? 'подарунків';
const TON = '<svg class="ton" viewBox="0 0 24 24" aria-label="TON"><path d="M12 21 3.6 6.6A1 1 0 0 1 4.5 5h15a1 1 0 0 1 .9 1.6L12 21Zm0 0V5"/></svg>';
const STARS = '<span aria-label="Stars">⭐</span>';
const price = g => `${g.currency === 'XTR' ? STARS : TON}${esc(fmt(g.price))}`;
const giftImg = (g, cls, lazy = true) => `<span class="${cls} thumb" style="${swatch(g.backdrop_colors)}"><img src="${esc(g.image)}" alt="" ${lazy ? 'loading="lazy"' : ''} onerror="this.remove()"></span>`;

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

const card = (g, i) => `
  <article class="card">
    <button class="card-open" data-i="${i}" aria-label="${esc(`${g.name} #${g.id}`)}">
      <span class="pic thumb" style="${swatch(g.backdrop_colors)}">
        <img src="${esc(g.image)}" alt="" loading="lazy" onerror="this.remove()">
        ${g.market ? `<span class="market">${esc(g.market)}</span>` : ''}
      </span>
      <span class="info"><span class="name">${esc(g.name)}</span><span class="num">#${esc(g.id)}</span></span>
    </button>
    <a class="buy" href="${esc(g.url)}" target="_blank" rel="noopener" aria-label="Купити ${esc(g.name)} #${esc(g.id)}">${price(g)}</a>
  </article>`;

const moreObserver = new IntersectionObserver(([e]) => { if (e.isIntersecting) showMore(); }, { rootMargin: '800px' });

function showMore() {
  if (shown >= list.length) return;
  $('#grid').insertAdjacentHTML('beforeend', list.slice(shown, shown + PAGE).map((g, j) => card(g, shown + j)).join(''));
  shown += PAGE;
  // Re-observing fires again right away if the sentinel is still on screen (tall screens, fast scroll).
  moreObserver.unobserve($('#more'));
  moreObserver.observe($('#more'));
}

function render() {
  list = filterGifts(gifts, state).sort(SORTS[sortIndex].cmp);
  shown = 0;
  $('#count').textContent = `${fmt(list.length)} з ${fmt(gifts.length)}`;
  $('#grid').innerHTML = list.length ? '' : '<p class="empty">Нічого не знайдено</p>';
  showMore();

  document.querySelectorAll('[data-sheet]').forEach(chip => {
    chip.textContent = chipLabel(chip.dataset.sheet);
    chip.classList.toggle('on', isActive(chip.dataset.sheet));
  });
  $('#sort').textContent = SORTS[sortIndex].label;
  $('#reset').hidden = !anyFilter();
  $('#alert').hidden = !(botUsername && anyFilter());
  $('#sheet-done').textContent = `Показати ${list.length} ${plural(list.length)}`;
  renderCollections();

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
  // Models belong to a collection, so once collections are picked only their models are offered.
  const pool = key === 'models' && state.names.length ? gifts.filter(g => state.names.includes(g.name)) : gifts;
  const opts = new Map();
  for (const g of pool) {
    const v = g[FIELD[key]];
    if (v) opts.set(v, { n: (opts.get(v)?.n ?? 0) + 1, g: opts.get(v)?.g ?? g });
  }
  const q = $('#sheet-search').value.trim().toLowerCase();
  const rows = [...opts].filter(([v]) => v.toLowerCase().includes(q)).sort(([a], [b]) => a.localeCompare(b));
  $('#sheet-body').innerHTML = rows.slice(0, MAX_OPTIONS).map(([v, { n, g }]) => `
      <label class="opt">
        ${key === 'models' || key === 'names' ? giftImg(g, 'opt-img') : ''}
        ${key === 'backdrops' ? `<span class="dot thumb" style="${swatch(g.backdrop_colors)}"></span>` : ''}
        <span class="opt-name">${esc(v)}${key === 'models' ? `<small>${esc(g.name)}</small>` : ''}</span>
        <span class="opt-count">${n}</span>
        <input type="checkbox" value="${esc(v)}" ${state[key].includes(v) ? 'checked' : ''}>
      </label>`).join('')
    + (rows.length > MAX_OPTIONS ? `<p class="empty">Ще ${rows.length - MAX_OPTIONS} — уточніть пошук або виберіть колекцію</p>` : '')
    || '<p class="empty">Нічого не знайдено</p>';
}

function showDialog(dialog) {
  dialog.showModal();
  tg?.BackButton.show();
}

function showSheet(key) {
  openSheet = key;
  $('#sheet-title').textContent = SHEETS[key];
  $('#sheet-search').value = '';
  $('#sheet-search').hidden = key === 'price';
  renderSheet();
  showDialog($('#sheet'));
}

// Collections tab: floor price (cheapest listing we have) and how many are on sale.
function renderCollections() {
  if (document.body.dataset.view !== 'collections') return;
  const by = new Map();
  for (const g of gifts) {
    const c = by.get(g.name);
    if (!c) by.set(g.name, { g, n: 1 });
    else { c.n++; if (SORTS[0].cmp(g, c.g) < 0) c.g = g; }
  }
  $('#collections').innerHTML = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([name, { g, n }]) => `
    <button class="coll" data-name="${esc(name)}">
      ${giftImg(g, 'opt-img')}
      <span class="opt-name">${esc(name)}<small>${fmt(counts[name] ?? n)} у продажу</small></span>
      <span class="floor">від ${price(g)}</span>
    </button>`).join('') || '<p class="empty">Поки немає даних</p>';
}

function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-selected', tab.dataset.view === view));
  renderCollections();
  scrollTo(0, 0);
}

function showGift(g) {
  const row = (label, value, rarity) => value ? `<div><dt>${label}</dt><dd>${esc(value)}${rarity ? ` <small>${esc(rarity)}</small>` : ''}</dd></div>` : '';
  $('#gift-body').innerHTML = `
    ${giftImg(g, 'detail-pic', false)}
    <h2>${esc(g.name)} <span class="num">#${esc(g.id)}</span></h2>
    <dl class="attrs">
      ${row('Модель', g.model, g.model_rarity)}${row('Фон', g.backdrop, g.backdrop_rarity)}${row('Символ', g.symbol, g.symbol_rarity)}${row('Маркет', g.market)}
    </dl>
    <a class="buy primary" href="${esc(g.url)}" target="_blank" rel="noopener">Купити за ${price(g)}</a>
    <p class="hint">Покупка відкриється в Telegram — ви підтверджуєте її самі.</p>`;
  showDialog($('#gift'));
}

// The bot reads alerts from chat commands; only the filters that are set go in, to keep it short.
function alertCommand() {
  const set = Object.entries(state).filter(([, v]) => Array.isArray(v) ? v.length : v !== null && v !== false && v !== '');
  return `/alert ${JSON.stringify(Object.fromEntries(set))}`;
}

function showAlertHelp() {
  const cmd = alertCommand();
  navigator.clipboard?.writeText(cmd).catch(() => {}); // the command is also shown for manual copying
  $('#gift-body').innerHTML = `
    <h2>🔔 Сповіщення</h2>
    <p>Бот напише вам, коли на маркетах з'являться нові подарунки за цими фільтрами.</p>
    <ol class="steps">
      <li>Команду вже скопійовано. Якщо ні — скопіюйте її нижче.</li>
      <li>Відкрийте бота, вставте команду й надішліть.</li>
      <li>Бот підтвердить протягом ~30 хвилин.</li>
    </ol>
    <textarea class="cmd" readonly rows="3" aria-label="Команда для бота">${esc(cmd)}</textarea>
    <a class="primary" href="https://t.me/${esc(botUsername)}" target="_blank" rel="noopener">Відкрити бота</a>`;
  showDialog($('#gift'));
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
  Object.assign(state, EMPTY());
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

$('#sort').addEventListener('click', () => {
  sortIndex = (sortIndex + 1) % SORTS.length;
  tg?.HapticFeedback.selectionChanged();
  render();
});

$('#alert').addEventListener('click', showAlertHelp);

document.querySelectorAll('[data-view]').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

$('#collections').addEventListener('click', e => {
  const coll = e.target.closest('.coll');
  if (!coll) return;
  state.names = [coll.dataset.name];
  tg?.HapticFeedback.selectionChanged();
  setView('gifts');
  render();
});

$('#grid').addEventListener('click', e => {
  const open = e.target.closest('.card-open');
  if (open) showGift(list[open.dataset.i]);
});

document.querySelectorAll('dialog').forEach(dialog => {
  // Tapping the dimmed area outside the sheet closes it.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (dialog.id === 'sheet') openSheet = null;
    if (!document.querySelector('dialog[open]')) tg?.BackButton.hide();
  });
});
tg?.BackButton.onClick(() => document.querySelector('dialog[open]')?.close());

// Inside Telegram, t.me links (gift pages with the Buy button, the bot) must go through the SDK
// to open natively instead of in a browser tab.
document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="https://t.me/"]');
  if (!link || !tg?.initData) return;
  e.preventDefault();
  if (link.classList.contains('buy')) tg.HapticFeedback.impactOccurred('medium');
  tg.openTelegramLink(link.href);
});

tg?.MainButton.onClick(() => {
  tg.HapticFeedback.impactOccurred('medium');
  const dialog = document.querySelector('dialog[open]');
  if (dialog) return dialog.close();
  $('#search').blur(); // hides the mobile keyboard
  $('#grid').scrollIntoView({ behavior: 'smooth' });
});

tg?.ready();
tg?.expand();
applyTheme();
tg?.onEvent('themeChanged', applyTheme);

// Static files, so docs/ also works on GitHub Pages without the server.
const getJson = url => fetch(url).then(r => r.ok ? r.json() : Promise.reject(r.status));
getJson('gifts.json')
  .then(data => { gifts = data; render(); })
  .catch(() => { $('#grid').innerHTML = '<p class="empty">Не вдалося завантажити подарунки</p>'; });
// Optional extras written by the collector; the app works without them.
getJson('stats.json').then(data => { counts = data; renderCollections(); }).catch(() => {});
getJson('bot.json').then(data => { botUsername = data.username; if (gifts.length) render(); }).catch(() => {});
