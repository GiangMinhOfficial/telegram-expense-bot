// Dat token nguon va moc chot sao ke vao khoi Note!H1:I3 — CHI khi ca khoi dang trong.
//
// Tu choi ghi de: neu da co gi o do thi in ra roi dung, de nguoi dung tu quyet.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

// Dung dung mac dinh voi src/config.ts (DEFERRED_SOURCES) — doi o mot cho thi
// phai doi ca hai, khong co cach nao import thang tu .mjs.
const SOURCES = [
  ['cc', 7],
  ['spl', 24],
  ['zlp', 28],
];

const env = loadEnv();
const token = await getAccessToken(env);
const base =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/range(address='H1:I3')`;

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
const rowsBefore = before.values ?? [['', ''], ['', ''], ['', '']];
console.log(`Truoc: ${JSON.stringify(rowsBefore)}`);

const empty = (v) => v === '' || v === null || v === undefined;
if (rowsBefore.some(([h, i]) => !empty(h) || !empty(i))) {
  console.log('Khoi H1:I3 da co noi dung. KHONG ghi de. Tu sua trong Excel neu can.');
  process.exit(0);
}

await call({ method: 'PATCH', body: JSON.stringify({ values: SOURCES }) });

const after = await call({});
console.log(`Sau  : ${JSON.stringify(after.values)}`);
console.log('Xong. Doi moc chot = sua cot I trong Excel, khong can deploy lai.');
