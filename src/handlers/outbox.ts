import { bumpOutbox, dropOutbox, dueOutbox } from '../db';
import type { Env } from '../env';
import { AuthExpiredError } from '../graph/auth';
import { sendMessage } from '../telegram/api';
import { performWrite, type ExactEntry } from './write';

const MAX_ATTEMPTS = 20;

/** Chạy theo Cron mỗi 5 phút: thử ghi lại các khoản đã nhận nhưng chưa vào Excel. */
export async function drainOutbox(env: Env): Promise<void> {
  const items = await dueOutbox(env.DB, 10);
  for (const it of items) {
    try {
      const raw = JSON.parse(it.payloadJson) as ExactEntry & {
        isCard?: boolean; targetMonth?: number;
      };
      // Khoản vào hàng đợi trước khi có tính năng thẻ thì thiếu hai trường này.
      const entry: ExactEntry = {
        ...raw,
        isCard: raw.isCard ?? false,
        targetMonth: raw.targetMonth ?? raw.date.m,
      };
      await performWrite(env, it.chatId, entry);
      await dropOutbox(env.DB, it.id);
    } catch (err) {
      // Mất xác thực thì mọi khoản còn lại cũng hỏng y hệt. Dừng cả vòng và KHÔNG
      // tăng attempts: thử ghi khi bot không có quyền không đáng tính là một lần thử.
      // Không có nó thì một ngày mất quyền đủ đốt sạch 20 lượt và vứt khoản đi thật.
      if (err instanceof AuthExpiredError) return;
      const msg = err instanceof Error ? err.message : String(err);
      await bumpOutbox(env.DB, it.id, msg);
      // Sau 20 lần thất bại thì báo người dùng một lần rồi thôi thử.
      if (it.attempts + 1 >= MAX_ATTEMPTS) {
        await sendMessage(
          env, it.chatId,
          `❌ Không ghi được một khoản sau ${MAX_ATTEMPTS} lần thử. Lỗi: ${msg.slice(0, 200)}`,
        );
      }
    }
  }
}
