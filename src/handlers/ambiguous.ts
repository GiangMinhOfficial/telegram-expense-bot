import { putPending, takePending } from '../db';
import type { Env } from '../env';
import type { ParsedEntry } from '../parse/message';
import { answerCallback, sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';
import { performWrite, type ExactEntry } from './write';

/**
 * `callback_data` của Telegram tối đa 64 byte — không nhét được cả khoản chi.
 * Lưu khoản chờ vào D1, callback chỉ mang id ngắn.
 */
export async function askAmount(
  env: Env, chatId: number, entry: ParsedEntry,
  targetMonth: number, low: number, high: number,
): Promise<void> {
  const id = crypto.randomUUID().slice(0, 8);
  await putPending(env.DB, {
    id, chatId, payloadJson: JSON.stringify({ ...entry, targetMonth, low, high }),
  });

  await sendMessage(
    env, chatId,
    `❓ "${entry.description} ${low}" — ý bạn là?`,
    {
      inline_keyboard: [[
        { text: formatVND(low), callback_data: `a:${id}:lo` },
        { text: formatVND(high), callback_data: `a:${id}:hi` },
      ]],
    },
  );
}

export async function resolveAmount(
  env: Env, cbId: string, chatId: number, data: string,
): Promise<void> {
  const [, id, which] = data.split(':');
  if (!id || !which) return;

  const pending = await takePending(env.DB, id);
  if (!pending) {
    await answerCallback(env, cbId, 'Đã hết hạn, gõ lại giúp mình.');
    return;
  }

  const p = JSON.parse(pending.payloadJson) as ParsedEntry & {
    low: number; high: number; targetMonth?: number;
  };
  const exact: ExactEntry = {
    category: p.category, description: p.description, date: p.date,
    // Bản ghi chờ tạo trước khi có tính năng thẻ thì thiếu hai trường này —
    // JSON.parse không kiểm kiểu nên phải tự chống undefined ở đây.
    isCard: p.isCard ?? false,
    targetMonth: p.targetMonth ?? p.date.m,
    amount: which === 'hi' ? p.high : p.low,
  };

  await answerCallback(env, cbId);
  await performWrite(env, chatId, exact);
}
