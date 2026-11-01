// Asks for the bot token, checks it with Telegram, then saves it to GitHub Secrets (for alerts).
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const token = (await rl.question('Вставте токен бота з @BotFather (вигляд 1234567890:AAH...): ')).trim();
rl.close();

if (!/^\d+:[\w-]{30,}$/.test(token)) {
  console.error('✗ Це не схоже на токен бота. У @BotFather: /mybots → ваш бот → API Token, скопіюйте його повністю.');
  process.exit(1);
}
const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();
if (!me.ok) {
  console.error(`✗ Telegram не прийняв токен (${me.description}). Можливо, його замінили через /revoke — візьміть новий у @BotFather.`);
  process.exit(1);
}

const WIN_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const r = spawnSync(existsSync(WIN_GH) ? WIN_GH : 'gh', ['secret', 'set', 'TG_BOT_TOKEN'], { input: token, encoding: 'utf8' });
if (r.status !== 0) {
  console.error(`✗ Не вдалося зберегти в GitHub: ${r.stderr || r.error}`);
  process.exit(1);
}
console.log(`✓ Токен бота @${me.result.username} збережено. Сповіщення запрацюють після наступного оновлення (до ~30 хв).`);
