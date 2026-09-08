// node scripts/verify-card.mjs <worker-url>
//
// Kiem chung khoan the tren FILE GOC, lai QUA WORKER da deploy bang update
// Telegram gia lap — khong goi Graph truc tiep de ghi.
//
// Vi sao phai qua Worker: performWrite goi Graph SONG SONG (va dinh dang, ghi
// D1, doc mot hoac hai sheet). Neu goi Graph thang tu script thi duong chay
// song song do khong bao gio duoc cham toi, ma do lai la thu moi them vao va
// de vo nhat. Graph co the tra 409 khi hai lenh chay dong thoi tren cung mot
// workbook — chi phep kiem nay bat duoc.
//
// Dien thoai cua ban SE nhan tin that tu bot. Do la mot phan cua phep kiem.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const URL_ = process.argv[2];
if (!URL_) { console.error('Thieu url Worker'); process.exit(1); }

const token = await getAccessToken(env);
const WB = `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

const g = async (path) => {
  const res = await fetch(`${WB}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

let updateId = Date.now();
const send = async (text) => {
  const res = await fetch(URL_, {
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
        from: { id: Number(env.ALLOWED_CHAT_ID), is_bot: false, first_name: 'Verify' },
        text,
      },
    }),
  });
  // Worker luon tra 200 de Telegram khong thu lai; loi that nam trong tin nhan.
  await new Promise((r) => setTimeout(r, 1500)); // cho OneDrive on dinh truoc khi doc lai
  return res.status;
};

// ── Boi canh ────────────────────────────────────────────────────────────────
// Khoi H (token) - I (moc chot) cua sheet Note, quet theo cot — dung form voi
// parseNote() trong src/note.ts. 7 la mac dinh cua rieng 'cc' (DEFERRED_SOURCES
// trong src/config.ts), khong con la mac dinh chung cho ca sheet nua.
const noteRows = (await g(`/worksheets('Note')/range(address='H1:I50')?$select=values`))
  .values ?? [];
const cutoffRaw = noteRows.find((r) => String(r[0] ?? '').trim().toLowerCase() === 'cc')?.[1];
const cutoffN = typeof cutoffRaw === 'number' ? cutoffRaw : Number.parseInt(String(cutoffRaw ?? ''), 10);
const cutoff = Number.isInteger(cutoffN) && cutoffN >= 1 && cutoffN <= 28 ? cutoffN : 7;
console.log(`Moc chot cc doc tu khoi H-I: ${JSON.stringify(cutoffRaw)} -> dung ${cutoff}`);

const now = new Date(Date.now() + 7 * 3600 * 1000); // gio Viet Nam
const year = now.getUTCFullYear();
const month = now.getUTCMonth() + 1;
if (month === 12) {
  console.log('Thang 12: khoan the sau moc chot bi tu choi theo thiet ke. Bo qua kich ban nay.');
  process.exit(0);
}

const day = cutoff + 1;
const probe = new Date(Date.UTC(year, month - 1, day));
if (probe.getUTCMonth() + 1 !== month) {
  console.error(`Thang ${month} khong co ngay ${day}. Khong chay duoc kich ban nay.`);
  process.exit(1);
}

const AMOUNT = 12_345; // >= 10000 nen parser hieu la so tien nguyen ven, khong hoi lai
const tag = `kc${Date.now().toString(36)}`; // co chu nen khong bi nham la so tien
const srcTable = `food_${month}`;
const dstTable = `food_${month + 1}`;

// Dong 10 cua Tom tat la "An uong sinh hoat", cot B..M la thang 1..12.
const SUMMARY = `/worksheets('${encodeURIComponent('Tóm tắt')}')` +
  `/range(address='B10:M10')?$select=values`;
const summary = async () => (await g(SUMMARY)).values?.[0] ?? [];
const rowsOf = async (t) => (await g(`/tables/${t}/rows?$select=values`)).value ?? [];
const hasTag = (rows, t) => rows.some((r) => String(r.values?.[0]?.[0] ?? '').includes(t));

// ── 1. Khoan the sau moc chot phai nhay sang thang sau ───────────────────────
console.log(`\n=== Khoan the ngay ${day}/${month} (sau moc ${cutoff}) ===`);
const before = await summary();
const status = await send(`/food ${tag} ${AMOUNT} ${day}/${month} cc`);
check('Worker nhan update', status === 200, `HTTP ${status}`);

check(`dong nam o ${dstTable}`, hasTag(await rowsOf(dstTable), tag));
check(`dong KHONG nam o ${srcTable}`, !hasTag(await rowsOf(srcTable), tag));

const mid = await summary();
check(
  `Tom tat cot thang ${month + 1} tang dung ${AMOUNT}`,
  Number(mid[month]) - Number(before[month]) === AMOUNT,
  `${before[month]} -> ${mid[month]}`,
);
check(
  `Tom tat cot thang ${month} dung yen`,
  Number(mid[month - 1]) === Number(before[month - 1]),
  `${before[month - 1]} -> ${mid[month - 1]}`,
);

await send('/undo');
const afterUndo = await summary();
check('sau /undo, Tom tat tro ve nguyen trang',
  JSON.stringify(afterUndo) === JSON.stringify(before));
check(`khong con dong rac trong ${dstTable}`, !hasTag(await rowsOf(dstTable), tag));

// ── 2. Cung ngay do nhung tra tien mat thi o lai thang nay ───────────────────
console.log(`\n=== Tien mat cung ngay ${day}/${month} ===`);
const tag2 = `kc${Date.now().toString(36)}m`;
await send(`/food ${tag2} ${AMOUNT} ${day}/${month}`);
check(`dong nam o ${srcTable}`, hasTag(await rowsOf(srcTable), tag2));
check(`dong KHONG nam o ${dstTable}`, !hasTag(await rowsOf(dstTable), tag2));
await send('/undo');
check(`khong con dong rac trong ${srcTable}`, !hasTag(await rowsOf(srcTable), tag2));

// ── 3. Bung ma viet tat — hoi quy cho loi da tung len production ─────────────
console.log('\n=== Bung ma viet tat ===');
await send('/other TC 15k');
const otherRows = await rowsOf(`other_${month}`);
const expanded = otherRows.some((r) => String(r.values?.[0]?.[0] ?? '') === 'TocoToco');
const literal = otherRows.some((r) => String(r.values?.[0]?.[0] ?? '') === 'TC');
check('mo ta ghi vao file la "TocoToco"', expanded);
check('KHONG ghi nguyen chu "TC"', !literal);
await send('/undo');

// ── 4. Khoan khong duoc phep quet the ────────────────────────────────────────
console.log('\n=== Tu choi cc voi thu nhap ===');
const incomeBefore = (await rowsOf(`income_${month}`)).length;
await send('/income luong test 20tr cc');
check('khong ghi dong nao vao income',
  (await rowsOf(`income_${month}`)).length === incomeBefore);

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? 'SACH' : `BAN — ${failed.length} muc that bai`}`);
process.exit(failed.length === 0 ? 0 : 1);
