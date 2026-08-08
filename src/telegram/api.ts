import type { Env } from '../env';

const api = (env: Env, method: string) =>
  `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function sendMessage(
  env: Env, chatId: number, html: string, replyMarkup?: unknown,
): Promise<void> {
  const res = await fetch(api(env, 'sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  // Không ném lỗi: gửi tin thất bại không được phép làm hỏng luồng ghi đã thành công.
  if (!res.ok) console.error('sendMessage that bai:', res.status, await res.text());
}

export async function answerCallback(env: Env, id: string, text?: string): Promise<void> {
  await fetch(api(env, 'answerCallbackQuery'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
  });
}
