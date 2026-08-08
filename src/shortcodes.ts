import type { Env } from './env';
import { readSheet } from './graph/workbook';

/**
 * Cache ở phạm vi module. Isolate của Worker sống qua nhiều request nên phần
 * lớn tin nhắn dùng lại được — giữ ngân sách lệnh gọi Graph ở mức ~3 mỗi tin
 * nhắn (thêm dòng, vá định dạng, đọc tổng) thay vì 4.
 */
let cache: { at: number; data: Record<string, string> } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * Đọc bảng mã viết tắt từ sheet Note (cột E = mã, cột F = tên đầy đủ).
 * Người dùng thêm mã mới bằng cách gõ thêm dòng trong Excel — không cần sửa code.
 */
export async function loadShortcodes(env: Env): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const sheet = await readSheet(env, 'Note');
    const out: Record<string, string> = {};
    for (const row of sheet.values) {
      const code = row[4];
      const full = row[5];
      if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
        out[code.trim().toUpperCase()] = full.trim();
      }
    }
    cache = { at: Date.now(), data: out };
    return out;
  } catch {
    return cache?.data ?? {}; // Không đọc được thì bỏ bung mã, vẫn ghi được chi tiêu.
  }
}
