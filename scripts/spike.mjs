// node scripts/spike.mjs — BƯỚC 0, cổng chặn.
// Kiểm chứng rows/add không phá công thức tổng hợp của workbook.
// CHỈ CHẠY TRÊN BẢN SAO. Cần TEST_ITEM_ID trong .dev.vars.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();

const ITEM = env.TEST_ITEM_ID;
if (!ITEM) {
  console.error('THIEU TEST_ITEM_ID trong .dev.vars.');
  console.error('Chay truoc: node scripts/make-test-copy.mjs');
  process.exit(1);
}
// Chot chan: khong bao gio chay len file goc, du .dev.vars co bi sua nham.
if (ITEM === env.DRIVE_ITEM_ID) {
  console.error('TEST_ITEM_ID trung DRIVE_ITEM_ID — day la FILE GOC. Dung lai.');
  process.exit(1);
}

const SHEET = 'Tháng 8';
const G = 'https://graph.microsoft.com/v1.0';

const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const ws = (n) => `${G}/me/drive/items/${ITEM}/workbook/worksheets('${encodeURIComponent(n)}')`;

/** Đọc cả giá trị lẫn công thức của một vùng. */
async function snapshot() {
  const q = async (sheet, addr, kind) => {
    const r = await fetch(`${ws(sheet)}/range(address='${addr}')?$select=${kind}`, { headers: H });
    const j = await r.json();
    if (!r.ok) throw new Error(`doc ${sheet}!${addr} that bai: ${JSON.stringify(j)}`);
    return j[kind];
  };
  // Dong Tong cong DI CHUYEN xuong moi khi chen dong, nen phai hoi Graph vi tri
  // hien tai cua no thay vi ghi cung dia chi. Dung chinh bai hoc cua spec 5.2:
  // tham chieu theo cau truc bam theo bang, tham chieu o thi khong.
  const totRes = await fetch(
    `${G}/me/drive/items/${ITEM}/workbook/tables/food_8/totalRowRange?$select=address,values`,
    { headers: H });
  const tot = await totRes.json();
  return {
    food8_total_addr: tot.address,
    food8_total: tot.values[0][2],
    thang8_N2: (await q(SHEET, 'N2', 'values'))[0][0],
    tomtat_I10: (await q('Tóm tắt', 'I10', 'values'))[0][0],
    tomtat_I13: (await q('Tóm tắt', 'I13', 'values'))[0][0],
    // Công thức quan trọng hơn giá trị: giá trị đúng mà công thức trỏ lệch
    // thì phải tới lần ghi sau mới lộ ra.
    f_tomtat_I10: (await q('Tóm tắt', 'I10', 'formulas'))[0][0],
    f_thang8_N2: (await q(SHEET, 'N2', 'formulas'))[0][0],
    f_thang8_M4: (await q(SHEET, 'M4', 'formulas'))[0][0],
    labels_M: (await q(SHEET, 'M2:M9', 'values')).map((r) => r[0]),
  };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const info = (name, detail) => console.log(`INFO  ${name}  — ${detail}`);

const before = await snapshot();
console.log('\nTRUOC:', JSON.stringify(before, null, 2), '\n');

// --- Chèn 1 dòng ---
const AMOUNT = 12345;
const DATE_FORMAT = 'd-mmm'; // khop dinh dang cac dong san co trong file
const T = `${G}/me/drive/items/${ITEM}/workbook/tables/food_8`;

const addRes = await fetch(`${T}/rows/add`,
  { method: 'POST', headers: H, body: JSON.stringify({ values: [['spike test', 46242, AMOUNT]] }) },
);
const added = await addRes.json();
check('1. Graph ghi duoc vao bang food_8', addRes.ok,
  addRes.ok ? `index=${added.index}` : JSON.stringify(added));
if (!addRes.ok) process.exit(1);

// rows/add KHONG ke thua dinh dang cot Ngay (cot tien thi co). Khong vá lai thi
// o ngay hien so serial tho "46242". Day la buoc thu hai cua thao tac ghi.
const fmtRes = await fetch(`${T}/rows/itemAt(index=${added.index})/range`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ numberFormat: [[null, DATE_FORMAT, null]] }),
});
check('1b. PATCH dinh dang o Ngay thanh cong', fmtRes.ok,
  fmtRes.ok ? `numberFormat = ${DATE_FORMAT}` : await fmtRes.text());

const after1 = await snapshot();
console.log('\nSAU 1 DONG:', JSON.stringify(after1, null, 2), '\n');

check('2. Tom tat!I10 tang dung so tien',
  after1.tomtat_I10 - before.tomtat_I10 === AMOUNT,
  `${before.tomtat_I10} -> ${after1.tomtat_I10}`);
check('2b. Tom tat!I13 tang dung so tien',
  after1.tomtat_I13 - before.tomtat_I13 === AMOUNT,
  `${before.tomtat_I13} -> ${after1.tomtat_I13}`);
check('3. Nhan cot M khong doi',
  JSON.stringify(after1.labels_M) === JSON.stringify(before.labels_M),
  JSON.stringify(after1.labels_M));
// Không phải phép kiểm PASS/FAIL: cả hai kết quả đều có thể đúng.
// Nếu Excel dịch A11 xuống A12 thì công thức PHẢI đổi theo; nếu Excel giới hạn
// dịch trong cột A:C mà không đụng M:O thì công thức giữ nguyên. Kiểm số 3
// (nhãn không đổi) mới là thứ quyết định.
info('3b. Cong thuc M4', `${before.f_thang8_M4} -> ${after1.f_thang8_M4}`);
check('4. SUBTOTAL cua bang va N2 tu tinh lai',
  after1.food8_total - before.food8_total === AMOUNT && after1.thang8_N2 - before.thang8_N2 === AMOUNT,
  `Tong cong ${before.food8_total}->${after1.food8_total} (o ${before.food8_total_addr}->${after1.food8_total_addr}),` +
  ` N2 ${before.thang8_N2}->${after1.thang8_N2}`);
check('4b. Cong thuc Tom tat!I10 va N2 khong hong',
  !String(after1.f_tomtat_I10).includes('#REF') && !String(after1.f_thang8_N2).includes('#REF'),
  `${after1.f_tomtat_I10} | ${after1.f_thang8_N2}`);

const rowRes = await fetch(
  `${T}/rows/itemAt(index=${added.index})/range?$select=text,values,numberFormat`, { headers: H });
const rc = await rowRes.json();
check('5. O Ngay hien thi thanh ngay, khong phai so serial',
  rc.values[0][1] === 46242 && !/^\d+$/.test(String(rc.text[0][1])),
  `gia tri ${rc.values[0][1]}, hien thi "${rc.text[0][1]}", format ${rc.numberFormat[0][1]}`);
check('5b. O so tien giu dinh dang tien te',
  /VND/.test(String(rc.text[0][2])),
  `hien thi "${rc.text[0][2]}"`);

// --- Chèn thêm 5 dòng: lỗi dịch chuyển có thể chỉ lộ sau nhiều lần chèn dồn ---
for (let i = 0; i < 5; i++) {
  const r = await fetch(`${T}/rows/add`,
    { method: 'POST', headers: H, body: JSON.stringify({ values: [[`spike ${i}`, 46242, 1000]] }) });
  if (!r.ok) {
    check(`6. Chen dong thu ${i + 2}`, false, JSON.stringify(await r.json()));
    break;
  }
  const j = await r.json();
  await fetch(`${T}/rows/itemAt(index=${j.index})/range`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ numberFormat: [[null, DATE_FORMAT, null]] }),
  });
}
const after6 = await snapshot();
console.log('\nSAU 6 DONG:', JSON.stringify(after6, null, 2), '\n');

check('6. Sau 6 lan chen don, Tom tat van dung',
  after6.tomtat_I10 - before.tomtat_I10 === AMOUNT + 5000,
  `${before.tomtat_I10} -> ${after6.tomtat_I10} (ky vong +${AMOUNT + 5000})`);
check('6b. Sau 6 lan chen, nhan cot M van nguyen',
  JSON.stringify(after6.labels_M) === JSON.stringify(before.labels_M),
  JSON.stringify(after6.labels_M));

// --- Xoá dòng (đường /undo) ---
const delRes = await fetch(`${T}/rows/itemAt(index=${added.index})`,
  { method: 'DELETE', headers: H });
const after7 = await snapshot();
check('7. DELETE rows/itemAt hoat dong va Tom tat van dung',
  delRes.ok && after7.tomtat_I10 - before.tomtat_I10 === 5000,
  `${after6.tomtat_I10} -> ${after7.tomtat_I10} (ky vong +5000)`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log('\nDUNG LAI. Cac muc sai:');
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  console.log('\nKhong di tiep Task 3. Bao lai de ban huong khac (spec muc 5.2).');
  process.exit(1);
}
console.log('\nKET LUAN: PASS — rows/add an toan.');
