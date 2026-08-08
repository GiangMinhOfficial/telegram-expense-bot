// node scripts/verify-buttons.mjs <worker-url>
// Kiem luong nut chon so tien (callback_query) va hai lenh truy van.
// Lay id khoan cho tu D1 bang wrangler, roi gia lap cu bam nut.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const URL_ = process.argv[2];
if (!URL_) { console.error('Thieu url Worker'); process.exit(1); }

const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const WB = `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = async () =>
  (await (await fetch(`${WB}/tables/food_8/rows?$select=index,values`, { headers: H })).json()).value ?? [];

let uid = Date.now();
const post = (body) => fetch(URL_, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-telegram-bot-api-secret-token': env.TELEGRAM_SECRET,
  },
  body: JSON.stringify(body),
});
const chat = { id: Number(env.ALLOWED_CHAT_ID) };
const from = { id: Number(env.ALLOWED_CHAT_ID), is_bot: false, first_name: 'Test' };

const sendText = (text) => post({
  update_id: uid++,
  message: { message_id: uid, date: Math.floor(Date.now() / 1000), chat, from, text },
});
const pressButton = (data) => post({
  update_id: uid++,
  callback_query: { id: String(uid), from, data, message: { message_id: uid, chat } },
});

/**
 * Chay SQL tren D1 remote va tra ve cac dong.
 *
 * Hai cai bay o day, deu da tra gia de biet:
 *  - Goi qua `npx` voi shell:true thi tham so chua khoang trang bi shell cat
 *    ra thanh nhieu tham so. Nen goi thang entry JS cua wrangler bang node,
 *    khong qua shell.
 *  - `--file` tra ve BANG TOM TAT ("Rows read": n), khong tra ve du lieu dong.
 *    Chi `--command` moi tra ve dong that.
 */
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

function runSql(sql) {
  const out = execFileSync(process.execPath, [
    WRANGLER, 'd1', 'execute', 'expense-bot', '--remote', '-y', '--json', '--command', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.slice(out.indexOf('[')))[0]?.results ?? [];
}

const pendingIds = () => runSql('SELECT id, payload_json FROM pending_amount;');

console.log('=== Luong nut chon so tien ===');
// Don sach khoan cho con sot tu cac lan chay truoc de phep kiem khong nhieu.
runSql('DELETE FROM pending_amount;');
const n0 = (await rows()).length;
const MARK = `nut ${Date.now().toString().slice(-6)}`;

await sendText(`/food ${MARK} 3000`);
await wait(2500);

check('1. Khong ghi gi khi chua bam nut', (await rows()).length === n0,
  `so dong van la ${n0}`);

const pend = pendingIds().filter((p) => String(p.payload_json).includes(MARK));
check('2. Khoan cho da luu vao D1', pend.length === 1,
  pend.length ? `id=${pend[0].id}` : 'khong tim thay');
if (pend.length !== 1) { console.log('\nDUNG LAI.'); process.exit(1); }

// Bam nut "3.000d" (lo)
await pressButton(`a:${pend[0].id}:lo`);
await wait(3000);

const all = await rows();
const added = all.find((x) => String(x.values?.[0]?.[0] ?? '').includes(MARK));
check('3. Bam nut xong moi ghi vao Excel', !!added,
  added ? JSON.stringify(added.values[0]) : 'khong tim thay');
if (added) {
  check('4. Ghi dung nhanh "lo" = 3.000d, khong phai 3.000.000d',
    added.values[0][2] === 3000, String(added.values[0][2]));
}

check('5. Khoan cho da bi xoa khoi D1 sau khi dung',
  pendingIds().filter((p) => String(p.payload_json).includes(MARK)).length === 0);

// Bam lai cung id — phai bi tu choi vi da dung
const again = await pressButton(`a:${pend[0].id}:hi`);
await wait(2500);
check('6. Bam lai cung nut khong ghi trung', (await rows()).length === n0 + 1,
  `so dong ${(await rows()).length}, ky vong ${n0 + 1}`);

console.log('\n=== Lenh truy van ===');
for (const cmd of ['/today', '/thang', '/help']) {
  const r = await sendText(cmd);
  check(`7. ${cmd} tra ve 200`, r.status === 200, `HTTP ${r.status}`);
  await wait(1200);
}

console.log('\n=== Don dep ===');
await sendText('/undo');
await wait(3000);
check('8. /undo da xoa dong vua ghi', (await rows()).length === n0,
  `tro ve ${(await rows()).length}`);

const junk = (await rows()).filter((x) => /nut |smoke|spike|kiem tra/i.test(String(x.values?.[0]?.[0] ?? '')));
check('9. Khong con dong rac trong Excel', junk.length === 0,
  junk.length ? JSON.stringify(junk.map((x) => x.values[0][0])) : 'sach');

// Don not khoan cho con sot tu cac lan chay truoc.
runSql('DELETE FROM pending_amount;');
check('10. Bang pending_amount da sach', pendingIds().length === 0);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) { failed.forEach((f) => console.log(`  FAIL: ${f.name}`)); process.exit(1); }
