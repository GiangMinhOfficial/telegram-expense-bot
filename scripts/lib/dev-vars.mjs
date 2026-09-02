// Đọc/ghi .dev.vars và lấy access token, có LƯU LẠI refresh token xoay vòng.
//
// Refresh token của tài khoản Microsoft cá nhân là loại xoay vòng: mỗi lần đổi
// lấy access token, Microsoft trả về một refresh token mới và vô hiệu cái cũ.
// Không ghi đè lại là lần chạy sau sẽ chết với invalid_grant.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const FILE = '.dev.vars';

export function loadEnv() {
  if (!existsSync(FILE)) {
    console.error(`Khong tim thay ${FILE}. Chay "npm run auth" truoc.`);
    process.exit(1);
  }
  return Object.fromEntries(
    readFileSync(FILE, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** Cập nhật một khoá trong .dev.vars, giữ nguyên các dòng khác. */
export function saveVar(key, value) {
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);
  let found = false;
  const out = lines.map((l) => {
    if (l.trim().startsWith(`${key}=`)) { found = true; return `${key}=${value}`; }
    return l;
  });
  if (!found) {
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push(`${key}=${value}`);
  }
  writeFileSync(FILE, out.join('\n') + '\n', 'utf8');
}

export async function getAccessToken(env) {
  const res = await fetch(
    'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MS_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: env.MS_REFRESH_TOKEN,
        scope: 'Files.ReadWrite offline_access',
      }),
    },
  );
  const tok = await res.json();
  if (!tok.access_token) {
    console.error('LAY ACCESS TOKEN THAT BAI:', tok);
    if (tok.error === 'invalid_grant') {
      console.error('\nRefresh token da het hieu luc. Chay lai: npm run auth');
    }
    process.exit(1);
  }

  // LUU NGAY. Tu thoi diem nay refresh token cu da bi vo hieu o phia Microsoft.
  if (tok.refresh_token && tok.refresh_token !== env.MS_REFRESH_TOKEN) {
    saveVar('MS_REFRESH_TOKEN', tok.refresh_token);
    env.MS_REFRESH_TOKEN = tok.refresh_token;
    console.log('(da luu refresh token moi vao .dev.vars)');
  }

  return tok.access_token;
}
