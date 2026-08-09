// Dat nhan va moc chot sao ke vao Note!A1:B1 — CHI khi ca hai o dang trong.
//
// Tu choi ghi de: neu da co gi o do thi in ra roi dung, de nguoi dung tu quyet.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const LABEL = 'Ngày chốt sao kê thẻ';
const DEFAULT_CUTOFF = 7;

const env = loadEnv();
const token = await getAccessToken(env);
const base =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/range(address='A1:B1')`;

const call = async (init) => {
  const res = await fetch(base, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    console.error('Graph loi', res.status, await res.text());
    process.exit(1);
  }
  return res.json();
};

const before = await call({});
const [a1, b1] = before.values?.[0] ?? ['', ''];
console.log(`Truoc: A1=${JSON.stringify(a1)}  B1=${JSON.stringify(b1)}`);

const empty = (v) => v === '' || v === null || v === undefined;
if (!empty(a1) || !empty(b1)) {
  console.log('Hai o nay da co noi dung. KHONG ghi de. Tu sua trong Excel neu can.');
  process.exit(0);
}

await call({ method: 'PATCH', body: JSON.stringify({ values: [[LABEL, DEFAULT_CUTOFF]] }) });

const after = await call({});
console.log(
  `Sau  : A1=${JSON.stringify(after.values?.[0]?.[0])}  B1=${JSON.stringify(after.values?.[0]?.[1])}`);
console.log('Xong. Doi moc chot = sua o B1 trong Excel, khong can deploy lai.');
