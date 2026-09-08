import { paymentMonth } from './billing';
import { CATEGORIES, cutoffDayFor } from './config';
import { enqueue } from './db';
import type { Env } from './env';
import { AuthExpiredError } from './graph/auth';
import { askAmount, resolveAmount } from './handlers/ambiguous';
import { handleMonth, handleToday } from './handlers/query';
import { handleReauth } from './handlers/reauth';
import { handleUndo } from './handlers/undo';
import { type ExactEntry, performWrite } from './handlers/write';
import { parseMessage } from './parse/message';
import { loadNote } from './note';
import { sendMessage } from './telegram/api';
import { carryOverRefusal, helpText } from './telegram/format';

export interface TelegramUpdate {
  message?: { chat: { id: number }; from?: { id: number }; text?: string; date: number };
  callback_query?: {
    id: string; from: { id: number }; data?: string;
    message?: { chat: { id: number } };
  };
}

export async function handleUpdate(
  env: Env, update: TelegramUpdate, origin: string,
): Promise<void> {
  const cb = update.callback_query;
  if (cb?.data?.startsWith('a:') && cb.message) {
    await resolveAmount(env, cb.id, cb.message.chat.id, cb.data);
    return;
  }

  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (/^\/help\b/i.test(text)) {
    await sendMessage(env, chatId, helpText(await loadNote(env)));
    return;
  }
  if (/^\/undo\b/i.test(text)) { await handleUndo(env, chatId); return; }
  if (/^\/today\b/i.test(text)) { await handleToday(env, chatId); return; }
  if (/^\/thang\b/i.test(text)) { await handleMonth(env, chatId); return; }
  // Đặt trên loadNote: /reauth phải chạy được đúng lúc bot không còn quyền đọc.
  if (/^\/reauth\b/i.test(text)) { await handleReauth(env, chatId, origin); return; }

  const note = await loadNote(env);
  const parsed = parseMessage(text, Date.now(), note.shortcodes);
  if (!parsed.ok) {
    await sendMessage(env, chatId, `⚠️ ${parsed.error}`);
    return;
  }

  const { entry } = parsed;

  const target = paymentMonth(entry.date, entry.source, cutoffDayFor(entry.source, note.cutoffDays));
  if (!target.ok) {
    await sendMessage(
      env, chatId,
      carryOverRefusal({ ...entry, label: CATEGORIES[entry.category].label }, target.error),
    );
    return;
  }

  if (entry.amount.kind === 'ambiguous') {
    await askAmount(env, chatId, entry, target.month, entry.amount.low, entry.amount.high);
    return;
  }

  const exact: ExactEntry = {
    ...entry, amount: entry.amount.amount, targetMonth: target.month,
  };
  try {
    await performWrite(env, chatId, exact);
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      await sendMessage(
        env, chatId,
        '🔑 Hết hiệu lực xác thực, chưa ghi được khoản này.\n'
        + 'Gửi /reauth để cấp quyền lại, rồi nhập lại khoản.',
      );
      return;
    }
    // Graph lỗi → không được mất khoản chi. Đưa vào hàng đợi, cron sẽ thử lại.
    await enqueue(env.DB, chatId, JSON.stringify(exact));
    await sendMessage(env, chatId, '⏳ Đã nhận, đang ghi lại. Sẽ báo khi xong.');
  }
}
