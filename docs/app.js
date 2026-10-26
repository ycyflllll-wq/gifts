const tg = window.Telegram?.WebApp;
const state = { mono: false, fewDigits: false, query: '' };
let gifts = [];

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const applyTheme = () => { document.documentElement.dataset.theme = tg?.colorScheme ?? 'light'; };

function render() {
  const list = filterGifts(gifts, state);
  $('#count').textContent = `Знайдено: ${list.length} з ${gifts.length}`;
  $('#grid').innerHTML = list.map(g => `
    <a class="card" href="${esc(g.url)}" target="_blank" rel="noopener">
      <img src="${esc(g.image)}" alt="${esc(g.name)}" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="name">${esc(g.name)}</div>
      <div class="row"><span class="id">#${esc(g.id)}</span><span class="price">${esc(g.price)} TON</span></div>
    </a>`).join('') || '<p class="empty">Нічого не знайдено</p>';

  const filtered = state.mono || state.fewDigits || state.query.trim();
  if (filtered && list.length) {
    tg?.MainButton.setText(`Показати ${list.length} подарунків`).show();
  } else {
    tg?.MainButton.hide();
  }
}

document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  const key = chip.dataset.filter;
  state[key] = !state[key];
  chip.setAttribute('aria-pressed', state[key]);
  tg?.HapticFeedback.selectionChanged();
  render();
}));

$('#search').addEventListener('input', e => { state.query = e.target.value; render(); });

// Inside Telegram, t.me links must go through the SDK to open natively instead of in a browser tab.
$('#grid').addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card || !tg?.initData) return;
  e.preventDefault();
  card.href.startsWith('https://t.me/') ? tg.openTelegramLink(card.href) : tg.openLink(card.href);
});

tg?.MainButton.onClick(() => {
  tg.HapticFeedback.impactOccurred('medium');
  $('#search').blur(); // hides the mobile keyboard
  $('#grid').scrollIntoView({ behavior: 'smooth' });
});

tg?.ready();
tg?.expand();
applyTheme();
tg?.onEvent('themeChanged', applyTheme);

fetch('gifts.json') // static file, so public/ also works on GitHub Pages without the server
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(data => { gifts = data; render(); })
  .catch(() => { $('#grid').innerHTML = '<p class="empty">Не вдалося завантажити подарунки</p>'; });
