// Kiểm tra vùng cố định A1:Z50 của sheet Note trả về đúng cái gì — CHỈ ĐỌC, không ghi.
//
// parseNote() (src/note.ts) đọc theo chỉ số cột TUYỆT ĐỐI, bù trừ theo offset
// của vùng đọc được — xem colOffset(). Bản cũ (loadShortcodes(), đã xoá) dùng
// usedRange nên vùng có thể trôi bắt đầu từ E4, khiến row[4] trỏ nhầm vào cột I
// và bảng mã viết tắt im lặng không hoạt động. Vùng cố định A1:Z50 giữ offset
// luôn bằng 0 nên lỗi đó không còn tái diễn.
import { loadEnv, getAccessToken } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);

const url =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/range(address='A1:Z50')?$select=address,values`;

const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error('Graph loi', res.status, await res.text());
  process.exit(1);
}
const { address, values } = await res.json();

console.log('address :', address);
console.log('so dong :', values.length, '| so cot:', values[0]?.length ?? 0);
console.log('');
console.log('Mang tra ve, danh so chi muc:');
values.forEach((row, i) => {
  const cells = row.map((v, j) => `[${j}]=${JSON.stringify(v)}`).join(' ');
  console.log(`  dong ${i}: ${cells}`);
});

// Mô phỏng đúng parseNote: chỉ số cột TUYỆT ĐỐI, bù trừ theo địa chỉ vùng đọc.
const m = /!\$?([A-Z]+)\$?\d+/.exec(address);
let off = 0;
if (m) { for (const ch of m[1]) off = off * 26 + (ch.charCodeAt(0) - 64); off -= 1; }

const at = (row, absCol) => (absCol - off >= 0 ? row[absCol - off] : undefined);

const codes = {};
for (const row of values) {
  const c = at(row, 4);
  const f = at(row, 5);
  if (typeof c === 'string' && typeof f === 'string' && c.trim() && f.trim()) {
    codes[c.trim().toUpperCase()] = f.trim();
  }
}

const rawCutoff = values[0] ? at(values[0], 1) : undefined;
const n = typeof rawCutoff === 'number' ? rawCutoff : Number.parseInt(String(rawCutoff ?? ''), 10);
const cutoff = Number.isInteger(n) && n >= 1 && n <= 28 ? n : 7;

console.log('');
console.log('ma viet tat :', JSON.stringify(codes));
console.log('moc chot    :', cutoff, Number.isInteger(n) && n >= 1 && n <= 28 ? '(doc tu B1)' : '(mac dinh)');
console.log(Object.keys(codes).length > 0 ? '=> OK' : '=> RONG — kiem tra lai cot E/F cua sheet Note');
