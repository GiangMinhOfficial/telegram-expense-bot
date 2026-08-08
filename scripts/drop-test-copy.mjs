// node scripts/drop-test-copy.mjs — xoa ban sao TEST tren OneDrive.
import { getAccessToken, loadEnv, saveVar } from './lib/dev-vars.mjs';

const env = loadEnv();
if (!env.TEST_ITEM_ID) { console.log('Khong co TEST_ITEM_ID, khong co gi de xoa.'); process.exit(0); }
if (env.TEST_ITEM_ID === env.DRIVE_ITEM_ID) {
  console.error('TEST_ITEM_ID trung DRIVE_ITEM_ID — day la FILE GOC. Dung lai.');
  process.exit(1);
}

const token = await getAccessToken(env);
const G = 'https://graph.microsoft.com/v1.0';
const H = { authorization: `Bearer ${token}` };

// Doi chieu ten truoc khi xoa — chot chan cuoi cung.
const info = await fetch(`${G}/me/drive/items/${env.TEST_ITEM_ID}`, { headers: H });
if (!info.ok) { console.log('Khong tim thay file, co le da xoa roi.'); saveVar('TEST_ITEM_ID', ''); process.exit(0); }
const item = await info.json();
if (!item.name.includes('TEST')) {
  console.error(`File ten "${item.name}" khong chua "TEST". Dung lai, khong xoa.`);
  process.exit(1);
}

const del = await fetch(`${G}/me/drive/items/${env.TEST_ITEM_ID}`, { method: 'DELETE', headers: H });
if (!del.ok) { console.error('XOA THAT BAI:', del.status, await del.text()); process.exit(1); }
saveVar('TEST_ITEM_ID', '');
console.log(`Da xoa "${item.name}" va go TEST_ITEM_ID khoi .dev.vars.`);
