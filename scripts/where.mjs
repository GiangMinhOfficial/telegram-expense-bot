// node scripts/where.mjs — hien vi tri va link cua file goc va ban TEST.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);
const H = { authorization: `Bearer ${token}` };
const G = 'https://graph.microsoft.com/v1.0';

for (const [label, id] of [['FILE GOC', env.DRIVE_ITEM_ID], ['BAN TEST', env.TEST_ITEM_ID]]) {
  if (!id) { console.log(`\n=== ${label} ===\n  (khong co id trong .dev.vars)`); continue; }
  const res = await fetch(`${G}/me/drive/items/${id}`, { headers: H });
  if (!res.ok) { console.log(`\n=== ${label} ===\n  KHONG TIM THAY (${res.status})`); continue; }
  const it = await res.json();
  const folder = decodeURIComponent(it.parentReference?.path ?? '').replace('/drive/root:', '');
  console.log(`\n=== ${label} ===`);
  console.log('  ten        :', it.name);
  console.log('  thu muc    :', folder || '/');
  console.log('  kich thuoc :', it.size, 'bytes');
  console.log('  sua lan cuoi:', it.lastModifiedDateTime);
  console.log('  link       :', it.webUrl);
}
