// node scripts/setup-telegram.mjs
// Sinh TELEGRAM_SECRET, tim ALLOWED_CHAT_ID tu tin nhan ban vua gui cho bot,
// va dat danh sach lenh. Ghi tat ca vao .dev.vars.
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { loadEnv, saveVar } from './lib/dev-vars.mjs';

const env = loadEnv();

let token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Tao bot bang @BotFather (/newbot) roi dan token vao day.');
  token = (await rl.question('TELEGRAM_BOT_TOKEN: ')).trim();
  rl.close();
}

const api = (m) => `https://api.telegram.org/bot${token}/${m}`;

const me = await (await fetch(api('getMe'))).json();
if (!me.ok) { console.error('TOKEN KHONG HOP LE:', me); process.exit(1); }
console.log(`Bot: @${me.result.username} (${me.result.first_name})`);
saveVar('TELEGRAM_BOT_TOKEN', token);

// --- ALLOWED_CHAT_ID tu getUpdates ---
const up = await (await fetch(api('getUpdates'))).json();
if (!up.ok) { console.error('getUpdates that bai:', up); process.exit(1); }

const senders = new Map();
for (const u of up.result) {
  const from = u.message?.from ?? u.callback_query?.from;
  if (from && !from.is_bot) senders.set(from.id, from);
}

if (senders.size === 0) {
  console.error('\nCHUA CO TIN NHAN NAO.');
  console.error(`Mo Telegram, nhan bat ky cho @${me.result.username}, roi chay lai lenh nay.`);
  console.error('(Neu da nhan roi ma van bao thieu: webhook dang bat se nuot update.');
  console.error(` Go webhook bang: curl -X POST ${api('deleteWebhook').replace(token, '<TOKEN>')})`);
  process.exit(1);
}
if (senders.size > 1) {
  console.error('\nCO NHIEU NGUOI GUI, khong doan duoc ai la ban:');
  for (const s of senders.values()) console.error(`  ${s.id}  ${s.first_name} @${s.username ?? '-'}`);
  console.error('Tu dat ALLOWED_CHAT_ID trong .dev.vars.');
  process.exit(1);
}

const you = [...senders.values()][0];
saveVar('ALLOWED_CHAT_ID', String(you.id));
console.log(`Ban: ${you.first_name} @${you.username ?? '-'}  id=${you.id}`);

// --- TELEGRAM_SECRET ---
if (!env.TELEGRAM_SECRET) {
  const secret = (randomUUID() + randomUUID()).replace(/-/g, '');
  saveVar('TELEGRAM_SECRET', secret);
  console.log(`TELEGRAM_SECRET: da sinh moi (${secret.length} ky tu)`);
} else {
  console.log('TELEGRAM_SECRET: da co san, giu nguyen');
}

// --- Danh sach lenh ---
const commands = [
  ['food', 'Ăn uống sinh hoạt'],
  ['eat_out', 'Ăn ngoài'],
  ['transport', 'Phương tiện di chuyển'],
  ['force', 'Chi tiêu bắt buộc'],
  ['other', 'Linh tinh'],
  ['other_expense', 'Chi tiêu khác'],
  ['income', 'Thu nhập'],
  ['invest', 'Đầu tư'],
  ['saving', 'Tiết kiệm'],
  ['undo', 'Hoàn tác khoản vừa ghi'],
  ['today', 'Xem chi tiêu hôm nay'],
  ['thang', 'Xem tổng tháng này'],
  ['help', 'Hướng dẫn cú pháp'],
].map(([command, description]) => ({ command, description }));

const setCmd = await (await fetch(api('setMyCommands'), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ commands }),
})).json();
console.log(`Danh sach lenh: ${setCmd.ok ? `da dat ${commands.length} lenh` : 'THAT BAI ' + JSON.stringify(setCmd)}`);

console.log('\nXong. Buoc tiep: nap secrets va deploy.');
