// node scripts/audit-real.mjs
// Quet ca 9 bang cua thang hien tai trong FILE GOC, tim dong rac do kiem thu
// de lai. Chi doc, khong ghi.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const WB = `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

const MONTH = 8;
const CATS = ['food', 'eat_out', 'transport', 'force', 'other', 'other_expense', 'income', 'invest', 'saving'];
const JUNK = /smoke|spike|kiem tra|kiểm tra|cron \d|nut \d|test ghi|fix test/i;

let junkTotal = 0;
console.log(`=== Quet Thang ${MONTH} trong FILE GOC ===\n`);

for (const cat of CATS) {
  const table = `${cat}_${MONTH}`;
  const res = await fetch(`${WB}/tables/${table}/rows?$select=index,values`, { headers: H });
  if (!res.ok) { console.log(`${table.padEnd(16)} KHONG DOC DUOC (${res.status})`); continue; }
  const rows = (await res.json()).value ?? [];
  const junk = rows.filter((r) => JUNK.test(String(r.values?.[0]?.[0] ?? '')));
  junkTotal += junk.length;
  const flag = junk.length ? `  <-- ${junk.length} DONG RAC` : '';
  console.log(`${table.padEnd(16)} ${String(rows.length).padStart(3)} dong${flag}`);
  for (const j of junk) console.log(`    index=${j.index}  ${JSON.stringify(j.values[0])}`);
}

const q = async (sheet, addr) => {
  const r = await fetch(
    `${WB}/worksheets('${encodeURIComponent(sheet)}')/range(address='${addr}')?$select=values,formulas`,
    { headers: H });
  const j = await r.json();
  return { value: j.values[0][0], formula: j.formulas[0][0] };
};

console.log('\n=== Cong thuc tong hop ===');
for (const [label, sheet, addr] of [
  ['Thang 8!N2  (tong nhom An uong)', 'Tháng 8', 'N2'],
  ['Thang 8!N8  (Tong chi thang)', 'Tháng 8', 'N8'],
  ['Tom tat!I10 (An uong T8)', 'Tóm tắt', 'I10'],
  ['Tom tat!I13 (Tong chi bat buoc)', 'Tóm tắt', 'I13'],
]) {
  const c = await q(sheet, addr);
  const broken = String(c.formula).includes('#REF') || String(c.value).includes('#REF');
  console.log(`${label.padEnd(34)} = ${String(c.value).padEnd(10)} ${c.formula}${broken ? '  <-- HONG' : ''}`);
}

console.log(`\n${junkTotal === 0 ? 'SACH — khong con dong rac nao.' : `CON ${junkTotal} DONG RAC.`}`);
process.exit(junkTotal === 0 ? 0 : 1);
