// Kiem chung /reauth di het duong: xin ma, cho dang nhap, doi ma lay chuoi,
// roi DOI THU chinh chuoi vua nhan. Chi bao dat khi buoc doi thu cuoi cung
// thanh cong -- xin duoc user code khong noi len duoc gi, ban cu cu the sinh
// ra chuoi khong bao gio doi duoc (AADSTS70000) trong khi buoc xin ma van
// chay ngon lanh.
//
// Buoc doi thu dung dung mot duong goi endpoint token voi exchangeRefreshToken
// trong src/graph/auth.ts (client_id + grant_type=refresh_token + scope,
// KHONG gui client_secret -- app da chuyen sang public client that ngay
// 2026-09-02: redirect URI doi sang platform "Mobile and desktop
// applications", client secret da xoa khoi Azure; gui kem secret gio la loi
// AADSTS90023). Repo nay khong co cach import TS tu script .mjs thuan (cac
// file trong src/ import lan nhau khong ghi duoi .ts, ESM cua Node doi duoi
// tuong minh), nen giu dung cung mot duong goi o day thay vi import -- neu
// sua exchangeRefreshToken thi sua ca cho nay.
import { loadEnv } from './lib/dev-vars.mjs';

const DEVICE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const SCOPE = 'Files.ReadWrite offline_access';

// Cac ma AADSTS da do duoc tren chinh app nay (xem ticket 04). Chia hai nhom
// theo dung cau hoi ticket 03 doi phan biet duoc.
const CHAIN_UNUSABLE = [
  [/AADSTS70000/, 'Chuoi refresh token khong dung duoc (invalid/malformed).'],
  [/AADSTS90023/, 'Request gui client_secret nhung app dang ky la public client -- loi trong script/ma nguon, khong phai chuoi hong.'],
];
const MISSING_PERMISSION = [
  [/AADSTS7000218/, 'Request thieu client_secret hoac client_assertion -- khong hop le nua tu khi app la public client, kiem lai app registration.'],
  [/AADSTS7000215/, 'client_secret sai hoac da het han.'],
  [/mobile|public client/i, 'App tren Azure chua bat "Allow public client flows".'],
];

function classify(errorText) {
  for (const [re, hint] of CHAIN_UNUSABLE) {
    if (re.test(errorText)) return `[chuoi khong dung duoc] ${hint}`;
  }
  for (const [re, hint] of MISSING_PERMISSION) {
    if (re.test(errorText)) return `[thieu quyen/cau hinh] ${hint}`;
  }
  return null;
}

function reportFailure(step, body, status) {
  const raw = String(body.error_description ?? body.error ?? `HTTP ${status}`);
  console.error(`HONG o buoc "${step}".`);
  console.error(`Microsoft tra loi: ${raw}`);
  const hint = classify(raw);
  if (hint) console.error(hint);
  // Dat exitCode chu khong goi process.exit(): thoat dot ngot luc socket cua
  // fetch chua dong xong lam libuv abort tren Windows, va ma thoat thanh rac (127).
  process.exitCode = 1;
}

async function main() {
  const env = loadEnv();

  // ── Buoc 1: xin ma ──────────────────────────────────────────────────────
  const dcRes = await fetch(DEVICE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, scope: SCOPE }),
  });
  const dc = await dcRes.json();
  if (!dc.device_code || !dc.user_code || !dc.verification_uri) {
    reportFailure('xin ma', dc, dcRes.status);
    return;
  }

  console.log(`Mo ${dc.verification_uri} va nhap ma: ${dc.user_code}`);
  console.log(`Dang cho dang nhap xong (ma song ${dc.expires_in ?? 900}s)...`);

  // ── Buoc 2: cho dang nhap xong, doi ma lay chuoi ────────────────────────
  // Chinh script nay ngoi cho duoc (khac Worker, khong co gioi han thoi gian
  // xu ly mot request), nen hoi lai Microsoft theo dung nhip RFC 8628 thay vi
  // bat nguoi dung tu bao "xong roi".
  let intervalMs = (dc.interval ?? 5) * 1000;
  const deadline = Date.now() + (dc.expires_in ?? 900) * 1000;
  let redeemed = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MS_CLIENT_ID,
        grant_type: DEVICE_GRANT,
        device_code: dc.device_code,
      }),
    });
    const body = await res.json();
    if (body.access_token && body.refresh_token) {
      redeemed = body;
      break;
    }
    if (body.error === 'authorization_pending') continue;
    if (body.error === 'slow_down') {
      intervalMs += 5000;
      continue;
    }
    reportFailure('doi ma lay chuoi', body, res.status);
    return;
  }
  if (!redeemed) {
    console.error('HONG: ma het han ma chua thay dang nhap xong.');
    process.exitCode = 1;
    return;
  }

  console.log('Da doi ma lay chuoi. Dang doi thu chinh chuoi do (day moi la phep do that)...');

  // ── Buoc 3: DOI THU chinh chuoi vua nhan ────────────────────────────────
  // Day la phep kiem chung duy nhat co gia tri -- xin duoc ma va doi duoc ma
  // lay chuoi khong noi len duoc chuoi do con dung duoc lan nao khong.
  const probeRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: redeemed.refresh_token,
      scope: SCOPE,
    }),
  });
  const probe = await probeRes.json();

  if (probeRes.ok && probe.access_token) {
    console.log('OK: doi thu chuoi thanh cong. /reauth dung duoc that, khong chi xin duoc ma.');
    return;
  }
  reportFailure('doi thu chuoi vua nhan', probe, probeRes.status);
}

await main();
