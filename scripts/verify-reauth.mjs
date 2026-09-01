// Kiem tra app tren Azure da bat "Allow public client flows" chua.
// Chi doc: ma xin ra khong dung den, tu het han sau 15 phut.
import { loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const res = await fetch(
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode',
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      scope: 'Files.ReadWrite offline_access',
    }),
  },
);
const b = await res.json();

if (b.user_code) {
  console.log('OK: app da bat public client flows, /reauth chay duoc.');
  console.log(`Ma thu: ${b.user_code} (bo qua, tu het han sau ${b.expires_in}s)`);
  process.exit(0);
}

console.error('CHUA CHAY DUOC:', b.error_description ?? b.error ?? res.status);
if (String(b.error_description ?? '').includes('mobile')) {
  console.error('\n-> Azure > App registrations > telegram-expense-bot > Authentication');
  console.error('   > "Allow public client flows" = Yes. Roi chay lai lenh nay.');
}
process.exit(1);
