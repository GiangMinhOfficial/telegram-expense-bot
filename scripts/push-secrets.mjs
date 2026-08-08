// node scripts/push-secrets.mjs --target=test|real
//
// Nap secrets tu .dev.vars len Worker. Tham so --target quyet dinh bot ghi vao
// file nao:
//   test  -> ban sao "Theo doi chi tieu - TEST.xlsx"  (mac dinh, an toan)
//   real  -> file goc "Theo doi chi tieu.xlsx"
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from './lib/dev-vars.mjs';

const target = (process.argv.find((a) => a.startsWith('--target=')) ?? '--target=test').split('=')[1];
if (!['test', 'real'].includes(target)) {
  console.error('--target phai la "test" hoac "real"');
  process.exit(1);
}

const env = loadEnv();
const driveItemId = target === 'real' ? env.DRIVE_ITEM_ID : env.TEST_ITEM_ID;
if (!driveItemId) {
  console.error(`Thieu ${target === 'real' ? 'DRIVE_ITEM_ID' : 'TEST_ITEM_ID'} trong .dev.vars`);
  process.exit(1);
}
if (target === 'test' && driveItemId === env.DRIVE_ITEM_ID) {
  console.error('TEST_ITEM_ID trung DRIVE_ITEM_ID — ban sao chua duoc tao. Dung lai.');
  process.exit(1);
}

const secrets = {
  MS_CLIENT_ID: env.MS_CLIENT_ID,
  MS_CLIENT_SECRET: env.MS_CLIENT_SECRET,
  MS_REFRESH_TOKEN: env.MS_REFRESH_TOKEN,
  DRIVE_ITEM_ID: driveItemId,
  TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_SECRET: env.TELEGRAM_SECRET,
  ALLOWED_CHAT_ID: env.ALLOWED_CHAT_ID,
};

const missing = Object.entries(secrets).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Thieu trong .dev.vars:', missing.join(', '));
  process.exit(1);
}

console.log(`Muc tieu: ${target.toUpperCase()}  (DRIVE_ITEM_ID = ...${driveItemId.slice(-12)})`);
console.log('Nap 7 secret:', Object.keys(secrets).join(', '));

// Ghi ra file tam ngoai repo, xoa ngay sau khi nap.
const dir = mkdtempSync(join(tmpdir(), 'wsec-'));
const file = join(dir, 'secrets.json');
try {
  writeFileSync(file, JSON.stringify(secrets), 'utf8');
  const r = spawnSync('npx', ['wrangler', 'secret', 'bulk', file], {
    stdio: 'inherit', shell: true,
  });
  process.exitCode = r.status ?? 1;
} finally {
  try { unlinkSync(file); } catch { /* da xoa */ }
}
