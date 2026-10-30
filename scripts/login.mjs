// One-time interactive login. Saves the session to .env (for local runs) and to GitHub Secrets
// (for the scheduled collector), without ever printing it.
import { TelegramClient, MemoryStorage } from '@mtcute/node';
import { createInterface } from 'node:readline/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { normalizePhone } from './phone.mjs';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async q => (await rl.question(q)).trim();
async function askHidden(q) {
  rl.output.write(q);
  rl._writeToOutput = () => {}; // don't echo the 2FA password
  try { return (await rl.question('')).trim(); } finally { delete rl._writeToOutput; rl.output.write('\n'); }
}

// Keep only digits: a stray bracket or space from copy-paste is the usual mistake here.
const apiId = Number((await ask('api_id (з my.telegram.org): ')).replace(/\D/g, ''));
const apiHash = await ask('api_hash (з my.telegram.org): ');
if (!Number.isInteger(apiId) || !/^[0-9a-f]{32}$/i.test(apiHash)) {
  console.error('api_id має бути числом, api_hash — 32 символи. Перевірте на my.telegram.org і запустіть ще раз.');
  process.exit(1);
}

const client = new TelegramClient({ apiId, apiHash, storage: new MemoryStorage() });
let user;
try {
  user = await client.start({
    phone: async () => normalizePhone(await ask('Номер телефону (+380...): ')),
    code: () => ask('Код з Telegram: '),
    password: () => askHidden('Пароль двоетапної перевірки (символи не відображаються): '),
    invalidCodeCallback: type => console.log(type === 'code' ? 'Невірний код, спробуйте ще раз.' : 'Невірний пароль, спробуйте ще раз.'),
  });
} catch (e) {
  const hint = { PHONE_NUMBER_INVALID: 'Telegram не прийняв номер. Введіть його повністю, наприклад +380681234567.', API_ID_INVALID: 'Неправильні api_id або api_hash — скопіюйте їх ще раз з my.telegram.org.' }[e.text];
  console.error(`\n✗ ${hint ?? `Не вдалося увійти: ${e.text ?? e.message}`}\nЗапустіть ще раз: node scripts/login.mjs`);
  process.exit(1);
}
const session = await client.exportSession();
await client.close();
rl.close();

const secrets = { TG_API_ID: String(apiId), TG_API_HASH: apiHash, TG_SESSION: session };
writeFileSync('.env', Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');

const WIN_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const gh = existsSync(WIN_GH) ? WIN_GH : 'gh';
for (const [name, value] of Object.entries(secrets)) {
  const r = spawnSync(gh, ['secret', 'set', name], { input: value, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`Не вдалося зберегти ${name} у GitHub: ${r.stderr || r.error}`);
    process.exit(1);
  }
}
console.log(`✓ Увійшли як ${user.displayName}. Сесію збережено у .env і в GitHub Secrets. Можете закрити цю вкладку.`);
