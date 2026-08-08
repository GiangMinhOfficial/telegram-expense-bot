// node scripts/make-test-copy.mjs
// Nhan ban file goc tren OneDrive thanh ban TEST va ghi TEST_ITEM_ID vao .dev.vars.
// Spike CHI duoc chay tren ban sao nay, khong bao gio tren file goc.
import { getAccessToken, loadEnv, saveVar } from './lib/dev-vars.mjs';

const G = 'https://graph.microsoft.com/v1.0';
const TEST_NAME = 'Theo dõi chi tiêu - TEST.xlsx';

const env = loadEnv();
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

// Neu ban sao da ton tai thi dung lai, khong tao them ban thu hai.
const existing = await fetch(
  `${G}/me/drive/root:${encodeURI(`/Documents/TCCN/${TEST_NAME}`)}`, { headers: H });
if (existing.ok) {
  const item = await existing.json();
  saveVar('TEST_ITEM_ID', item.id);
  console.log(`Ban sao da co san: ${item.name}`);
  console.log(`TEST_ITEM_ID=${item.id}  (da ghi vao .dev.vars)`);
  process.exit(0);
}

console.log(`Dang nhan ban "${TEST_NAME}" ...`);
const copyRes = await fetch(
  `${G}/me/drive/items/${env.DRIVE_ITEM_ID}/copy`,
  { method: 'POST', headers: H, body: JSON.stringify({ name: TEST_NAME }) },
);
if (copyRes.status !== 202) {
  console.error('NHAN BAN THAT BAI:', copyRes.status, await copyRes.text());
  process.exit(1);
}

// Graph tra ve 202 kem URL theo doi tien trinh — phai cho den khi xong.
const monitor = copyRes.headers.get('location');
let itemId = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const m = await fetch(monitor);
  const st = await m.json();
  if (st.status === 'completed') { itemId = st.resourceId; break; }
  if (st.status === 'failed') {
    console.error('NHAN BAN THAT BAI:', JSON.stringify(st));
    process.exit(1);
  }
  process.stdout.write('.');
}
console.log('');

if (!itemId) {
  console.error('Qua thoi gian cho. Kiem tra OneDrive xem ban sao da tao chua.');
  process.exit(1);
}

// Doi chieu lai de chac chan id tro dung file, va chac chan KHAC file goc.
const check = await fetch(`${G}/me/drive/items/${itemId}`, { headers: H });
const item = await check.json();
if (item.id === env.DRIVE_ITEM_ID) {
  console.error('LOI NGHIEM TRONG: id ban sao trung id file goc. Dung lai.');
  process.exit(1);
}

saveVar('TEST_ITEM_ID', item.id);
console.log(`Xong: ${item.name}  (${item.size} bytes)`);
console.log(`TEST_ITEM_ID=${item.id}  (da ghi vao .dev.vars)`);
console.log('\nGio chay: npm run spike');
