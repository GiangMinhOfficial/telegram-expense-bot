// node scripts/smoke.mjs <worker-url>
// Kiem thu end-to-end bang cach gia lap update cua Telegram gui vao Worker.
// Bot se nhan tin that ve Telegram cua ban — do la mot phan cua phep kiem.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const URL_ = process.argv[2];
if (!URL_) { console.error('Thieu url Worker'); process.exit(1); }

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

let updateId = Date.now();
const post = (body, secret) =>
  fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
    },
    body: JSON.stringify(body),
  });

const message = (text, fromId = Number(env.ALLOWED_CHAT_ID)) => ({
  update_id: updateId++,
  message: {
    message_id: updateId, date: Math.floor(Date.now() / 1000),
    chat: { id: Number(env.ALLOWED_CHAT_ID) },
    from: { id: fromId, is_bot: false, first_name: 'Test' },
    text,
  },
});

console.log('=== Lop bao mat ===');
const noSecret = await post(message('/help'), null);
check('1. POST khong co secret bi tu choi', noSecret.status === 403, `HTTP ${noSecret.status}`);

const badSecret = await post(message('/help'), 'sai-secret');
check('2. POST sai secret bi tu choi', badSecret.status === 403, `HTTP ${badSecret.status}`);

const stranger = await post(message('/food hack 999k', 111111111), env.TELEGRAM_SECRET);
check('3. Nguoi la co secret dung van bi bo qua', stranger.status === 200, `HTTP ${stranger.status}`);

console.log('\n=== Ghi that vao ban TEST ===');
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const G = 'https://graph.microsoft.com/v1.0';
const T = `${G}/me/drive/items/${env.TEST_ITEM_ID}/workbook/tables/food_8`;

const rowsBefore = await (await fetch(`${T}/rows?$select=index`, { headers: H })).json();
const nBefore = (rowsBefore.value ?? []).length;

const MARK = `smoke ${Date.now().toString().slice(-6)}`;
const r = await post(message(`/food ${MARK} 12k`), env.TELEGRAM_SECRET);
check('4. Worker nhan lenh ghi', r.status === 200, `HTTP ${r.status}`);

await new Promise((res) => setTimeout(res, 2500));
const rowsAfter = await (await fetch(`${T}/rows?$select=index,values`, { headers: H })).json();
const rows = rowsAfter.value ?? [];
check('5. Bang co them dung 1 dong', rows.length === nBefore + 1, `${nBefore} -> ${rows.length}`);

const added = rows.find((x) => String(x.values?.[0]?.[0] ?? '').includes(MARK));
check('6. Dong moi dung mo ta', !!added, added ? JSON.stringify(added.values[0]) : 'khong tim thay');
if (added) {
  check('7. So tien dung 12000', added.values[0][2] === 12000, String(added.values[0][2]));
  check('8. Ngay la serial hom nay', typeof added.values[0][1] === 'number', String(added.values[0][1]));

  const fmt = await (await fetch(
    `${T}/rows/itemAt(index=${added.index})/range?$select=text,numberFormat`, { headers: H })).json();
  check('9. O Ngay hien thi thanh ngay, khong phai serial tho',
    !/^\d+$/.test(String(fmt.text[0][1])), `hien thi "${fmt.text[0][1]}"`);
}

console.log('\n=== Cac ca loi ===');
for (const [text, label] of [
  ['/food an trua', 'thieu so tien'],
  ['/food 40k', 'thieu mo ta'],
  ['/xyz abc 40k', 'lenh khong ton tai'],
  ['/food an trua 40k 5/8/2027', 'ngay ngoai 2026'],
]) {
  const res = await post(message(text), env.TELEGRAM_SECRET);
  check(`10. "${text}" (${label}) khong lam sap Worker`, res.status === 200, `HTTP ${res.status}`);
}

console.log('\n=== Don dep: /undo dong vua ghi ===');
const undo = await post(message('/undo'), env.TELEGRAM_SECRET);
check('11. /undo tra ve 200', undo.status === 200, `HTTP ${undo.status}`);
await new Promise((res) => setTimeout(res, 2500));
const rowsEnd = await (await fetch(`${T}/rows?$select=index`, { headers: H })).json();
check('12. /undo da xoa dong', (rowsEnd.value ?? []).length === nBefore,
  `${rows.length} -> ${(rowsEnd.value ?? []).length}`);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) { failed.forEach((f) => console.log(`  FAIL: ${f.name}`)); process.exit(1); }
