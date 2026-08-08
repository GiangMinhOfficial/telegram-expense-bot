// node scripts/set-webhook.mjs [url]
// Dang ky webhook Telegram tro ve Worker, kem secret_token de chan gia mao.
// Khong truyen url thi chi hien trang thai hien tai.
import { loadEnv } from './lib/dev-vars.mjs';

const env = loadEnv();
const api = (m) => `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${m}`;

const url = process.argv[2];

if (url) {
  const res = await fetch(api('setWebhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: env.TELEGRAM_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    }),
  });
  const j = await res.json();
  console.log(j.ok ? `Da dang ky webhook: ${url}` : `THAT BAI: ${JSON.stringify(j)}`);
  if (!j.ok) process.exit(1);
}

const info = await (await fetch(api('getWebhookInfo'))).json();
const r = info.result ?? {};
console.log('\n=== Trang thai webhook ===');
console.log('url                    :', r.url || '(chua dat)');
console.log('secret_token           :', r.has_custom_certificate !== undefined
  ? (env.TELEGRAM_SECRET ? 'da gui khi dang ky' : '(khong)') : '?');
console.log('pending_update_count   :', r.pending_update_count ?? 0);
console.log('allowed_updates        :', (r.allowed_updates ?? []).join(', ') || '(mac dinh)');
if (r.last_error_message) {
  console.log('LOI GAN NHAT           :', r.last_error_message);
  console.log('luc                    :', new Date((r.last_error_date ?? 0) * 1000).toISOString());
}
