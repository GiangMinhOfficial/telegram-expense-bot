// In ra nội dung THẬT của sheet Note trong vùng cố định A1:Z50 — CHỈ ĐỌC, không ghi.
//
// Đây là bản dump chẩn đoán — KHÔNG phải bản sao luật nghiệp vụ của parseNote()
// (src/note.ts). Script chỉ báo cáo sheet đang chứa gì; người chạy tự đối chiếu
// kết quả với khoảng 1–28 và mặc định từng nguồn (DEFERRED_SOURCES trong
// src/config.ts) nếu cần. Bản trước từng mô phỏng lại cả colOffset() lẫn luật
// chốt hạn — hai bản luật độc lập, hễ parseNote() đổi mà quên sửa ở đây thì
// script âm thầm báo sai cho người đang dùng nó để chẩn đoán sự cố. .mjs chạy
// bằng node thường không import được src/*.ts nên không thể gọi thẳng
// parseNote() — nhưng điều đó chỉ biện minh cho việc gọi Graph trực tiếp,
// không biện minh cho việc chép lại luật.
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

// Vùng đọc luôn cố định ở A1 (xem url ở trên) nên chỉ số mảng trùng thẳng với
// chỉ số cột — cột E là [4], F là [5], H là [7], I là [8], không cần bù trừ
// offset như parseNote() phải làm cho một vùng bất kỳ. Bố cục cột này là bố
// cục sheet thật, việc liệt kê thẳng ở đây là hợp lý cho một bản dump chẩn đoán.
const codes = {};
for (const row of values) {
  const c = row[4];
  const f = row[5];
  if (typeof c === 'string' && typeof f === 'string' && c.trim() && f.trim()) {
    codes[c.trim().toUpperCase()] = f.trim();
  }
}

const cutoffs = {};
for (const row of values) {
  const src = row[7];
  if (typeof src === 'string' && src.trim()) cutoffs[src.trim().toLowerCase()] = row[8];
}

console.log('');
console.log('ma viet tat :', JSON.stringify(codes));
console.log('moc chot (khoi H-I):', JSON.stringify(cutoffs));
console.log(Object.keys(codes).length > 0 ? '=> OK' : '=> RONG — kiem tra lai cot E/F cua sheet Note');
