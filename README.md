# Gift Finder — Telegram Mini App

Каталог цифрових подарунків з фільтрами «Монохромні», «≤ 3 різних цифри в номері» та пошуком.

```
server.js           Express: віддає docs/ та API (потрібен лише локально)
docs/gifts.json   дані каталогу (15 тестових подарунків), сюди ж пише POST
docs/index.html   розмітка
docs/styles.css   стилі на змінних теми Telegram
docs/filters.js   логіка фільтрів (спільна для браузера і тесту)
docs/app.js       рендер, Telegram SDK: MainButton, HapticFeedback, тема
test/               тест фільтрів (node --test)
```

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
curl -X POST http://localhost:3000/api/gifts -H "Content-Type: application/json" -H "X-Admin-Token: secret" -d "{\"id\":4444,\"name\":\"Lol Pop\",\"price\":5,\"is_monochrome\":true,\"image\":\"https://nft.fragment.com/gift/lolpop-4444.webp\",\"url\":\"https://t.me/nft/LolPop-4444\"}"
```

## Постійна адреса без сервера: GitHub Pages

Папка `docs/` — це готовий сайт, сервер для неї не потрібен. Увесь проєкт лежить у репозиторії `gifts` на GitHub, а Pages публікує `docs/` з гілки `main` (Settings → Pages → Branch: `main`, папка `/docs`).

Адреса сайту: `https://<ваш-логін>.github.io/gifts/` — її вставте в BotFather (крок 3 нижче).

Щоб змінити каталог: відкрийте `docs/gifts.json` у репозиторії → ✏️ → редагуйте → **Commit changes**. Сайт оновиться за 1–2 хвилини.

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
