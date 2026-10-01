// node scripts/spike-sort.mjs — spike kiểm chứng sắp xếp bảng theo ngày.
// Ba câu hỏi: (1) định dạng ngày có đi theo dòng khi sắp không, (2) dòng trống và
// dòng không ngày có dồn xuống đáy, cùng ngày có giữ thứ tự ghi không, (3) Tóm tắt
// và dòng Tổng cộng có còn đúng không.
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
const TABLE = 'food_8';
const DATE_FORMAT = 'd-mmm';
const TAG = 'spike-sort';
const G = 'https://graph.microsoft.com/v1.0';

const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const WB = `${G}/me/drive/items/${ITEM}/workbook`;
const T = `${WB}/tables/${TABLE}`;
const ws = (n) => `${WB}/worksheets('${encodeURIComponent(n)}')`;

async function call(method, url, body) {
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : {};
  if (!r.ok) throw new Error(`${method} ${url.replace(WB, '')} -> ${r.status}: ${txt.slice(0, 400)}`);
  return j;
}

// Chot chan thu hai: ten file phai co chu TEST.
const meta = await call('GET', `${G}/me/drive/items/${ITEM}?$select=name`);
if (!/TEST/.test(meta.name)) {
  console.error(`File "${meta.name}" khong phai ban TEST. Dung lai.`);
  process.exit(1);
}
console.log(`File: ${meta.name}\n`);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const info = (name, detail) => console.log(`INFO  ${name}  — ${detail}`);

/** Các dòng dữ liệu của bảng: giá trị, chữ hiển thị, định dạng. */
async function rows() {
  const r = await call('GET', `${T}/dataBodyRange?$select=address,values,text,numberFormat`);
  return r.values.map((v, i) => ({ v, text: r.text[i], fmt: r.numberFormat[i] }));
}
const cell = async (sheet, addr, kind) =>
  (await call('GET', `${ws(sheet)}/range(address='${addr}')?$select=${kind}`))[kind];

async function snapshot() {
  const tot = await call('GET', `${T}/totalRowRange?$select=address,values`);
  return {
    total: tot.values[0][2],
    N2: (await cell(SHEET, 'N2', 'values'))[0][0],
    I10: (await cell('Tóm tắt', 'I10', 'values'))[0][0],
    f_I10: (await cell('Tóm tắt', 'I10', 'formulas'))[0][0],
    f_N2: (await cell(SHEET, 'N2', 'formulas'))[0][0],
    labels: (await cell(SHEET, 'M2:M9', 'values')).map((r) => r[0]),
  };
}

const isBlank = (r) => r.v.every((c) => c === '' || c === null);
const dump = (title, rs) => {
  console.log(`\n${title}`);
  rs.forEach((r, i) => console.log(
    `  ${String(i).padStart(2)} | ${String(r.v[0]).padEnd(22)} | ${String(r.text[1]).padEnd(8)} ` +
    `${String(r.fmt[1]).padEnd(8)} | ${r.text[2]}`));
  console.log('');
};

let failed = [];
try {
  const before = await snapshot();
  const rows0 = await rows();
  dump('TRUOC:', rows0);
  info('0. Bang dang co', `${rows0.length} dong, ${rows0.filter(isBlank).length} dong trong`);

  // --- Thêm dòng thử, CỐ Ý lộn xộn: dòng trống và dòng không ngày chen giữa ---
  const dated = rows0.map((r) => r.v[1]).filter((d) => typeof d === 'number');
  const base = dated.length ? Math.min(...dated) : 46236;
  const SAME = base + 2;
  const add = [
    [`${TAG} muon`, base + 20, 400],
    [null, null, null],
    [`${TAG} khong ngay`, null, 500],
    [`${TAG} cung ngay 1`, SAME, 1],
    [`${TAG} som`, base - 1, 100],
    [`${TAG} cung ngay 2`, SAME, 2],
    [`${TAG} cung ngay 3`, SAME, 3],
  ];
  const ADDED_SUM = add.reduce((s, r) => s + (r[2] ?? 0), 0);
  for (const values of add) {
    const j = await call('POST', `${T}/rows/add`, { values: [values] });
    // Vá định dạng ngày như bot đang làm — kể cả dòng trống, để xem nó có giữ được không.
    if (values[1] !== null || values[0] === null) {
      await call('PATCH', `${T}/rows/itemAt(index=${j.index})/range`,
        { numberFormat: [[null, DATE_FORMAT, null]] });
    }
  }
  check('1. Them duoc dong trong va dong khong ngay qua rows/add', true, `${add.length} dong`);
  dump('SAU KHI THEM, CHUA SAP:', await rows());

  // --- Sắp theo cột Ngày (cột thứ 2 của bảng, key = 1) ---
  await call('POST', `${T}/sort/apply`, { fields: [{ key: 1, ascending: true }] });
  const sorted = await rows();
  dump('SAU KHI SAP:', sorted);

  const kind = (r) => (isBlank(r) ? 2 : typeof r.v[1] === 'number' ? 0 : 1);
  const kinds = sorted.map(kind);
  check('2. Thu tu khoi: co ngay -> khong ngay -> trong',
    kinds.every((k, i) => i === 0 || kinds[i - 1] <= k), kinds.join(''));
  const ds = sorted.filter((r) => kind(r) === 0).map((r) => r.v[1]);
  check('2b. Ngay tang dan', ds.every((d, i) => i === 0 || ds[i - 1] <= d), ds.join(','));
  const same = sorted.filter((r) => String(r.v[0]).startsWith(`${TAG} cung ngay`)).map((r) => r.v[2]);
  check('2c. Cung ngay giu thu tu ghi', same.join(',') === '1,2,3', same.join(','));

  const mine = sorted.filter((r) => String(r.v[0]).startsWith(TAG) && typeof r.v[1] === 'number');
  check('3. Dinh dang ngay di theo dong',
    mine.every((r) => r.fmt[1] === DATE_FORMAT && !/^\d+$/.test(String(r.text[1]))),
    mine.map((r) => `${r.text[1]}/${r.fmt[1]}`).join(' '));
  const others = sorted.filter((r) => !String(r.v[0]).startsWith(TAG) && typeof r.v[1] === 'number');
  check('3b. Dong cu van hien ngay dung',
    others.every((r) => !/^\d+$/.test(String(r.text[1]))),
    others.map((r) => r.text[1]).join(' '));
  check('3c. Cot so tien giu dinh dang tien te',
    sorted.filter((r) => typeof r.v[2] === 'number').every((r) => /VND/.test(String(r.text[2]))));

  const after = await snapshot();
  check('4. Tong cong, N2, Tom tat!I10 tang dung',
    after.total - before.total === ADDED_SUM && after.N2 - before.N2 === ADDED_SUM &&
    after.I10 - before.I10 === ADDED_SUM,
    `Tong ${before.total}->${after.total}, N2 ${before.N2}->${after.N2}, I10 ${before.I10}->${after.I10} (ky vong +${ADDED_SUM})`);
  check('4b. Cong thuc khong hong',
    !/#REF/.test(String(after.f_I10)) && !/#REF/.test(String(after.f_N2)),
    `${after.f_I10} | ${after.f_N2}`);
  check('4c. Nhan cot M van nguyen',
    JSON.stringify(after.labels) === JSON.stringify(before.labels));

  // --- Trạng thái sắp có bám lại trên bảng không (mũi tên ở tiêu đề cột) ---
  const st = await call('GET', `${T}/sort`);
  info('5. Trang thai sort sau apply', JSON.stringify(st.fields ?? st));
  await call('POST', `${T}/sort/clear`);
  const cleared = await rows();
  check('5b. sort/clear khong lam doi thu tu dong',
    JSON.stringify(cleared.map((r) => r.v)) === JSON.stringify(sorted.map((r) => r.v)));

  // --- Sắp lại lần hai: thứ tự phải y nguyên (không xáo dòng cùng ngày) ---
  await call('POST', `${T}/sort/apply`, { fields: [{ key: 1, ascending: true }] });
  const again = await rows();
  check('6. Sap lan hai cho cung ket qua',
    JSON.stringify(again.map((r) => r.v)) === JSON.stringify(sorted.map((r) => r.v)));
  await call('POST', `${T}/sort/clear`);

  // --- Dọn: xoá dòng thử và dòng trống đã thêm, từ dưới lên để chỉ số không trôi ---
  const cur = await rows();
  let blanksToDrop = 1;
  for (let i = cur.length - 1; i >= 0; i--) {
    const mineRow = String(cur[i].v[0]).startsWith(TAG);
    const dropBlank = isBlank(cur[i]) && blanksToDrop > 0;
    if (!mineRow && !dropBlank) continue;
    if (dropBlank) blanksToDrop--;
    await call('DELETE', `${T}/rows/itemAt(index=${i})`);
  }
  const end = await snapshot();
  const rowsEnd = await rows();
  check('7. Xoa dong theo chi so sau khi sap van dung, tong ve nhu cu',
    end.total === before.total && end.I10 === before.I10 && rowsEnd.length === rows0.length,
    `Tong ${end.total} (truoc ${before.total}), ${rowsEnd.length} dong (truoc ${rows0.length})`);
  dump('CUOI (da don, bang giu thu tu da sap):', rowsEnd);
} catch (err) {
  check('X. Loi giua chung', false, err instanceof Error ? err.message : String(err));
  console.log(`\nCo the con dong "${TAG} ..." trong bang ${TABLE} cua file TEST — xoa tay hoac chay lai.`);
}

failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail ?? ''}`));
  process.exit(1);
}
