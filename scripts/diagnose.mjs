// Chan doan dinh dang cua dong moi them so voi dong cu. Chi doc, khong ghi.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const G = 'https://graph.microsoft.com/v1.0';
const ITEM = env.TEST_ITEM_ID;
const ws = `${G}/me/drive/items/${ITEM}/workbook/worksheets('${encodeURIComponent('Tháng 8')}')`;

const r = await fetch(`${ws}/range(address='A2:C14')?$select=values,text,numberFormat`, { headers: H });
const d = await r.json();

console.log('=== Bang food_8: dong cu (4-8) vs dong moi them (9-13) ===\n');
console.log('row | mo ta               | ngay: text / format        | tien: text / format');
console.log('-'.repeat(96));
for (let i = 0; i < d.values.length; i++) {
  const row = 2 + i;
  const desc = String(d.values[i][0] ?? '').slice(0, 18).padEnd(18);
  const dTxt = String(d.text[i][1] ?? '').padEnd(10);
  const dFmt = String(d.numberFormat[i][1] ?? '').slice(0, 14).padEnd(14);
  const aTxt = String(d.text[i][2] ?? '').padEnd(12);
  const aFmt = String(d.numberFormat[i][2] ?? '').slice(0, 30);
  console.log(`${String(row).padStart(3)} | ${desc} | ${dTxt} ${dFmt} | ${aTxt} ${aFmt}`);
}
