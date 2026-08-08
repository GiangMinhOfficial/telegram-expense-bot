// node scripts/verify-real.mjs <worker-url>
// Xac nhan bot da tro vao FILE GOC, va chung minh khong de lai dau vet:
// ghi mot dong danh dau, doi chieu, /undo, roi kiem file tro ve dung nhu cu.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const URL_ = process.argv[2];
if (!URL_) { console.error('Thieu url Worker'); process.exit(1); }

const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const G = 'https://graph.microsoft.com/v1.0';
const ITEM = env.DRIVE_ITEM_ID;
const WB = `${G}/me/drive/items/${ITEM}/workbook`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const read = async (sheet, addr) => {
  const r = await fetch(
    `${WB}/worksheets('${encodeURIComponent(sheet)}')/range(address='${addr}')?$select=values`,
    { headers: H });
  return (await r.json()).values[0][0];
};
const rowCount = async () =>
  ((await (await fetch(`${WB}/tables/food_8/rows?$select=index`, { headers: H })).json()).value ?? []).length;

let updateId = Date.now();
const send = (text) => fetch(URL_, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-telegram-bot-api-secret-token': env.TELEGRAM_SECRET,
  },
  body: JSON.stringify({
    update_id: updateId++,
    message: {
      message_id: updateId, date: Math.floor(Date.now() / 1000),
      chat: { id: Number(env.ALLOWED_CHAT_ID) },
      from: { id: Number(env.ALLOWED_CHAT_ID), is_bot: false, first_name: 'Test' },
      text,
    },
  }),
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Chup trang thai truoc ---
const before = {
  rows: await rowCount(),
  i10: await read('Tóm tắt', 'I10'),
  i13: await read('Tóm tắt', 'I13'),
  n2: await read('Tháng 8', 'N2'),
};
console.log('TRUOC:', JSON.stringify(before), '\n');

// --- Ghi mot dong danh dau ---
const MARK = `kiem tra ${Date.now().toString().slice(-6)}`;
await send(`/food ${MARK} 1k`);
await wait(3000);

const rowsMid = (await (await fetch(`${WB}/tables/food_8/rows?$select=index,values`, { headers: H })).json()).value ?? [];
const added = rowsMid.find((x) => String(x.values?.[0]?.[0] ?? '').includes(MARK));

check('1. Dong da vao FILE GOC (khong phai ban TEST)', !!added,
  added ? JSON.stringify(added.values[0]) : 'khong tim thay — bot co the van tro vao ban TEST');
if (!added) { console.log('\nDUNG LAI.'); process.exit(1); }

const mid = { i10: await read('Tóm tắt', 'I10'), i13: await read('Tóm tắt', 'I13') };
check('2. Tom tat cap nhat dung 1.000d', mid.i10 - before.i10 === 1000 && mid.i13 - before.i13 === 1000,
  `I10 ${before.i10}->${mid.i10}, I13 ${before.i13}->${mid.i13}`);

const fmt = await (await fetch(
  `${WB}/tables/food_8/rows/itemAt(index=${added.index})/range?$select=text`, { headers: H })).json();
check('3. O Ngay hien thi thanh ngay', !/^\d+$/.test(String(fmt.text[0][1])),
  `hien thi "${fmt.text[0][1]}"`);

// --- Hoan tac ---
await send('/undo');
await wait(3000);

const after = {
  rows: await rowCount(),
  i10: await read('Tóm tắt', 'I10'),
  i13: await read('Tóm tắt', 'I13'),
  n2: await read('Tháng 8', 'N2'),
};
console.log('\nSAU:', JSON.stringify(after));

check('4. So dong tro ve nhu cu', after.rows === before.rows, `${before.rows} -> ${after.rows}`);
check('5. Tom tat!I10 tro ve nhu cu', after.i10 === before.i10, `${before.i10} -> ${after.i10}`);
check('6. Tom tat!I13 tro ve nhu cu', after.i13 === before.i13, `${before.i13} -> ${after.i13}`);
check('7. Thang 8!N2 tro ve nhu cu', after.n2 === before.n2, `${before.n2} -> ${after.n2}`);

const leftovers = ((await (await fetch(`${WB}/tables/food_8/rows?$select=values`, { headers: H })).json()).value ?? [])
  .filter((x) => /kiem tra|smoke|spike|test/i.test(String(x.values?.[0]?.[0] ?? '')));
check('8. Khong con dong rac nao trong food_8', leftovers.length === 0,
  leftovers.length ? JSON.stringify(leftovers.map((x) => x.values[0][0])) : 'sach');

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) { failed.forEach((f) => console.log(`  FAIL: ${f.name}`)); process.exit(1); }
console.log('\nBot da tro vao file goc va khong de lai dau vet.');
