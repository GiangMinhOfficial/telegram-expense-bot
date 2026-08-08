import { enqueue } from './db';
import type { Env } from './env';
import { AuthExpiredError } from './graph/auth';
import { askAmount, resolveAmount } from './handlers/ambiguous';
import { handleMonth, handleToday } from './handlers/query';
import { handleUndo } from './handlers/undo';
import { performWrite } from './handlers/write';
import { parseMessage } from './parse/message';
import { loadShortcodes } from './shortcodes';
import { sendMessage } from './telegram/api';
import { helpText } from './telegram/format';

export interface TelegramUpdate {
  message?: { chat: { id: number }; from?: { id: number }; text?: string; date: number };
  callback_query?: {
    id: string; from: { id: number }; data?: string;
    message?: { chat: { id: number } };
  };
}

export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
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
    await sendMessage(env, chatId, helpText(await loadShortcodes(env)));
    return;
  }
  if (/^\/undo\b/i.test(text)) { await handleUndo(env, chatId); return; }
  if (/^\/today\b/i.test(text)) { await handleToday(env, chatId); return; }
  if (/^\/thang\b/i.test(text)) { await handleMonth(env, chatId); return; }

  const shortcodes = await loadShortcodes(env);
  const parsed = parseMessage(text, Date.now(), shortcodes);
  if (!parsed.ok) {
    await sendMessage(env, chatId, `⚠️ ${parsed.error}`);
    return;
  }

  const { entry } = parsed;
  if (entry.amount.kind === 'ambiguous') {
    await askAmount(env, chatId, entry, entry.amount.low, entry.amount.high);
    return;
  }

  const exact = { ...entry, amount: entry.amount.amount };
  try {
    await performWrite(env, chatId, exact);
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      await sendMessage(env, chatId, '🔑 Bot mất quyền ghi OneDrive. Cần cấp quyền lại.');
      return;
    }
    // Graph lỗi → không được mất khoản chi. Đưa vào hàng đợi, cron sẽ thử lại.
    await enqueue(env.DB, chatId, JSON.stringify(exact));
    await sendMessage(env, chatId, '⏳ Đã nhận, đang ghi lại. Sẽ báo khi xong.');
  }
}
