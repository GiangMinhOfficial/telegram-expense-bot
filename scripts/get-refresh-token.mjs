// Chạy một lần: node scripts/get-refresh-token.mjs
// Mở trình duyệt, đăng nhập, rồi in ra refresh token + drive item id.
import http from 'node:http';
import { createInterface } from 'node:readline/promises';

const TENANT = 'consumers';
const REDIRECT = 'http://localhost:8788/callback';
const SCOPE = 'Files.ReadWrite offline_access';
const FILE_PATH = '/Documents/TCCN/Theo dõi chi tiêu.xlsx';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const clientId = (await rl.question('MS_CLIENT_ID: ')).trim();
const clientSecret = (await rl.question('MS_CLIENT_SECRET: ')).trim();
rl.close();

const authUrl =
  `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_mode=query&scope=${encodeURIComponent(SCOPE)}`;

console.log('\nMở link này trong trình duyệt và đăng nhập:\n');
console.log(authUrl + '\n');

const code = await new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost:8788');
    const c = url.searchParams.get('code');
    res.end(c ? 'Xong. Quay lai terminal.' : 'Thieu code.');
    if (c) {
      server.close();
      resolve(c);
    }
  });
  server.listen(8788);
});

const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      scope: SCOPE,
    }),
  },
);
const tok = await tokenRes.json();
if (!tok.refresh_token) {
  console.error('THAT BAI:', tok);
  process.exit(1);
}

const itemRes = await fetch(
  `https://graph.microsoft.com/v1.0/me/drive/root:${encodeURI(FILE_PATH)}`,
  { headers: { authorization: `Bearer ${tok.access_token}` } },
);
const item = await itemRes.json();
if (!item.id) {
  console.error('KHONG TIM THAY FILE:', item);
  process.exit(1);
}

console.log('\n=== Dán vào .dev.vars ===\n');
console.log(`MS_CLIENT_ID=${clientId}`);
console.log(`MS_CLIENT_SECRET=${clientSecret}`);
console.log(`MS_REFRESH_TOKEN=${tok.refresh_token}`);
console.log(`DRIVE_ITEM_ID=${item.id}`);
console.log(`\nFile: ${item.name}  (${item.size} bytes)`);
