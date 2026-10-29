# Gift Finder — Telegram Mini App

Каталог цифрових подарунків з фільтрами «Монохромні», «≤ 3 різних цифри в номері» та пошуком.

```
server.js                Express: віддає docs/ та API (потрібен лише локально)
docs/gifts.json          дані каталогу; генерується scripts/collect.mjs
docs/index.html          розмітка
docs/styles.css          стилі
docs/filters.js          логіка фільтрів (спільна для браузера і тесту)
docs/app.js              рендер, Telegram SDK: MainButton, BackButton, HapticFeedback, тема
scripts/login.mjs        одноразовий вхід у Telegram → .env і GitHub Secrets
scripts/collect.mjs      збирає подарунки з Telegram Market у docs/gifts.json
.github/workflows/       запускає collect.mjs кожні 30 хвилин
test/                    тести (node --test)
```

## Подарунки з маркетів

Зараз підключено **Telegram Market** (офіційний API Telegram, `payments.getResaleStarGifts`): найдешевші 50 лотів з кожної колекції.

1. Отримайте `api_id` і `api_hash` на https://my.telegram.org → API development tools.
2. Увійдіть один раз: `node scripts/login.mjs` (номер, код з Telegram, пароль 2FA). Сесія збережеться у `.env` (не потрапляє в git) і в GitHub Secrets (`TG_API_ID`, `TG_API_HASH`, `TG_SESSION`).
3. GitHub Actions (`Collect gifts`) кожні ~30 хвилин оновлює `docs/gifts.json`. Запустити вручну: вкладка **Actions** → **Collect gifts** → **Run workflow**. Локально: `node --env-file=.env scripts/collect.mjs`.

Сесія дає повний доступ до акаунта Telegram — краще використовувати окремий акаунт. Якщо сесія витекла: Telegram → Налаштування → Пристрої → завершіть цей сеанс, і запустіть `login.mjs` знову.

«Монохромні» для маркетних лотів = фон чорний, білий або сірий (майже без насиченості).

Збирач лише читає дані: у `scripts/collect.mjs` дозволені тільки методи `payments.getStarGifts` і `payments.getResaleStarGifts`, тож з акаунта нічого не купується.

## Купівля

Кнопка з ціною (і «Купити» в картці подарунка) відкриває сторінку подарунка в Telegram (`t.me/nft/...`) з кнопкою купівлі. Покупку підтверджує сам користувач у Telegram; застосунок нічого не купує.

## Сповіщення (як у снайпер-ботах)

1. Додайте токен бота в GitHub Secrets: `gh secret set TG_BOT_TOKEN` (вставте токен від @BotFather).
2. Після наступного запуску збирача в застосунку з'явиться кнопка **🔔 Сповіщати**: вона копіює команду `/alert {...}` з поточними фільтрами й відкриває бота.
3. Надішліть команду боту. Перша людина, яка напише боту, стає його власником; іншим бот не відповідає.
4. Кожні ~30 хвилин бот пише про нові лоти (або ті, що подешевшали), які підходять під фільтр. `/alerts` — список, `/stop 2` або `/stop all` — видалити.

Сповіщення зберігаються в `alerts.json` (логіка — `scripts/alerts.mjs`).

## Запуск локально

Потрібен Node.js 18+.

```bash
npm install
npm test
npm start
```

Відкрийте http://localhost:3000 — у звичайному браузері все працює, крім MainButton і вібрації (вони є лише всередині Telegram).

## API

- `GET /api/gifts` — список подарунків.
- `POST /api/gifts` — додати подарунок. Потрібна змінна середовища `ADMIN_TOKEN` і заголовок `X-Admin-Token`:

```bash
curl -X POST http://localhost:3000/api/gifts -H "Content-Type: application/json" -H "X-Admin-Token: secret" -d "{\"id\":4444,\"name\":\"Lol Pop\",\"model\":\"Mandarin\",\"backdrop\":\"Onyx Black\",\"symbol\":\"Kudu Totem\",\"backdrop_colors\":[\"#4d5254\",\"#313638\"],\"price\":5,\"is_monochrome\":true,\"image\":\"https://nft.fragment.com/gift/lolpop-4444.webp\",\"url\":\"https://t.me/nft/LolPop-4444\"}"
```

## Постійна адреса без сервера: GitHub Pages

Папка `docs/` — це готовий сайт, сервер для неї не потрібен. Увесь проєкт лежить у репозиторії `gifts` на GitHub, а Pages публікує `docs/` з гілки `main` (Settings → Pages → Branch: `main`, папка `/docs`).

Адреса сайту: `https://<ваш-логін>.github.io/gifts/` — її вставте в BotFather (крок 3 нижче).

`docs/gifts.json` тепер щоразу перезаписує автооновлення, тому редагувати його вручну немає сенсу.

## Як підключити до Telegram-бота

1. **Створіть бота.** У Telegram відкрийте [@BotFather](https://t.me/BotFather) → `/newbot` → вкажіть назву та username (має закінчуватись на `bot`). Збережіть токен — він знадобиться лише якщо бот ще щось робитиме; для самої Mini App токен не потрібен.
2. **Отримайте публічний HTTPS-URL.** Telegram відкриває Mini App тільки по `https://`.
   - Для тесту: запустіть `npm start`, а в іншому терміналі тунель, наприклад `cloudflared tunnel --url http://localhost:3000` або `ngrok http 3000`. Скопіюйте виданий `https://…` адрес.
   - Для продакшну: задеплойте проєкт на Render / Railway / Fly.io / VPS (команда старту `npm start`, порт з `PORT`).
3. **Прив'яжіть URL до бота** (один із варіантів, можна обидва):
   - **Кнопка меню:** BotFather → `/mybots` → ваш бот → *Bot Settings* → *Menu Button* → *Configure menu button* → вставте URL і назву кнопки (напр. «Подарунки»).
   - **Повноцінна Mini App з власним посиланням:** BotFather → `/newapp` → оберіть бота → назва, опис, картинка 640×360 → вставте URL → задайте short name. Посилання буде `https://t.me/<бот>/<short_name>`.
4. **Перевірте.** Відкрийте чат з ботом → натисніть кнопку меню. Увімкніть фільтр — має бути вібрація; внизу з'явиться MainButton «Показати N подарунків». Змініть тему Telegram — застосунок перефарбується.
5. **Після зміни URL** (новий тунель видає новий адрес) повторіть крок 3.

## Що варто додати для продакшну

- Перевірку `Telegram.WebApp.initData` на сервері (HMAC з токеном бота), якщо API почне віддавати персональні дані або приймати дії від користувачів.
- Справжню БД замість `gifts.json`.
- Реальні дані: зараз номери/ціни в `gifts.json` вигадані, тож частина картинок з fragment.com може не завантажитись (картка тоді показує порожнє місце під фото).
