// Kiểm tra usedRange của sheet Note trả về đúng cái gì — CHỈ ĐỌC, không ghi.
//
// loadShortcodes() giả định mảng trả về bắt đầu từ cột A (row[4] = E, row[5] = F).
// Nhưng Note không có dữ liệu ở cột A..D, nên usedRange có thể bắt đầu từ E4.
// Nếu vậy row[4] đang trỏ vào cột I và bảng mã viết tắt im lặng không hoạt động.
import { loadEnv, getAccessToken } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);

const url =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/usedRange(valuesOnly=true)?$select=address,values`;

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

// Mô phỏng đúng những gì loadShortcodes đang làm.
const out = {};
for (const row of values) {
  const code = row[4];
  const full = row[5];
  if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
    out[code.trim().toUpperCase()] = full.trim();
  }
}
console.log('');
console.log('loadShortcodes() se tra ve:', JSON.stringify(out));
console.log(Object.keys(out).length === 0 ? '=> RONG — bung ma viet tat KHONG chay' : '=> co du lieu');
