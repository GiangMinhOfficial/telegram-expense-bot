// node scripts/verify-cron.mjs
// Nap mot khoan vao outbox roi cho cron (*/5) xu ly. Kiem ca hai dieu:
//   - scheduled handler co that su chay
//   - khoan trong hang doi duoc ghi vao Excel roi xoa khoi outbox
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const WB = `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const runSql = (sql) => {
  const out = execFileSync(process.execPath, [
    WRANGLER, 'd1', 'execute', 'expense-bot', '--remote', '-y', '--json', '--command', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results ?? [];
};

const rows = async () =>
  (await (await fetch(`${WB}/tables/food_8/rows?$select=index,values`, { headers: H })).json()).value ?? [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MARK = `cron ${Date.now().toString().slice(-6)}`;
const payload = JSON.stringify({
  category: 'food', description: MARK,
  date: { y: 2026, m: 8, d: 8 }, amount: 2000,
});

runSql('DELETE FROM outbox;');
const n0 = (await rows()).length;
console.log(`Excel truoc: ${n0} dong trong food_8`);

runSql(
  `INSERT INTO outbox (chat_id, payload_json, created_at) ` +
  `VALUES (${Number(env.ALLOWED_CHAT_ID)}, '${payload.replace(/'/g, "''")}', ${Date.now()});`,
);
console.log(`Da nap vao outbox: "${MARK}" 2.000d`);
console.log(`outbox hien co ${runSql('SELECT COUNT(*) AS n FROM outbox;')[0].n} ban ghi`);

const nextTick = 5 - (new Date().getUTCMinutes() % 5);
console.log(`\nCron chay moi 5 phut. Lan ke tiep khoang ${nextTick} phut nua.`);
console.log('Dang cho (toi da 7 phut)...');

let done = false;
for (let i = 0; i < 42; i++) {
  await wait(10_000);
  const left = runSql('SELECT COUNT(*) AS n FROM outbox;')[0].n;
  process.stdout.write(`.${left === 0 ? '' : ''}`);
  if (left === 0) { done = true; break; }
}
console.log('');

if (!done) {
  console.log('FAIL  Cron khong xu ly hang doi sau 7 phut.');
  console.log('      Kiem: npx wrangler tail  va  wrangler.toml [triggers] crons');
  console.log('      Trang thai outbox:', JSON.stringify(runSql('SELECT id, attempts, last_error FROM outbox;')));
  process.exit(1);
}

console.log('PASS  Cron da xu ly va don hang doi');

const all = await rows();
const added = all.find((x) => String(x.values?.[0]?.[0] ?? '').includes(MARK));
if (!added) {
  console.log('FAIL  Khoan bien mat khoi outbox nhung KHONG vao Excel');
  process.exit(1);
}
console.log(`PASS  Khoan da vao Excel: ${JSON.stringify(added.values[0])}`);

// Don dep: xoa dong test
await fetch(`${WB}/tables/food_8/rows/itemAt(index=${added.index})`, { method: 'DELETE', headers: H });
const after = (await rows()).length;
console.log(`PASS  Da don dep, Excel tro ve ${after} dong (truoc la ${n0})`);
runSql('DELETE FROM last_write;');

if (after !== n0) { console.log('FAIL  So dong khong tro ve nhu cu'); process.exit(1); }
console.log('\n3/3 PASS');
