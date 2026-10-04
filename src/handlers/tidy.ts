import type { Env } from '../env';
import { isSortedByDate, needsBlankRow } from '../graph/tidy-plan';
import { appendBlankRow, readTableRows, sortTableByDate } from '../graph/workbook';
import { sendMessage } from '../telegram/api';

const STALE_READ_RETRY_MS = 2000;

/**
 * Đọc bảng sau khi sắp, và chỉ trả về bản đọc đã thấy lệnh sắp. Bản đọc cũ thì chờ
 * rồi đọc lại đúng một lần; vẫn cũ thì ném (xem `isSortedByDate`).
 */
async function readSortedRows(env: Env, table: string): Promise<unknown[][]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, STALE_READ_RETRY_MS));
    const rows = await readTableRows(env, table);
    if (!rows) throw new Error('không đọc được các dòng của bảng sau khi sắp');
    if (isSortedByDate(rows)) return rows;
  }
  throw new Error('bản đọc sau khi sắp vẫn là thứ tự cũ');
}

/**
 * Dọn bảng vừa nhận khoản: sắp theo ngày, rồi thêm một dòng trống nếu đáy bảng chưa có.
 * KHÔNG xoá dòng nào. Mọi lỗi đổi thành một tin cảnh báo — hàm này không ném.
 */
export async function tidyTable(env: Env, chatId: number, table: string): Promise<void> {
  try {
    await sortTableByDate(env, table);
    const rows = await readSortedRows(env, table);
    if (needsBlankRow(rows)) await appendBlankRow(env, table);
  } catch (err) {
    console.error('don bang that bai:', table, err);
    try {
      await sendMessage(
        env, chatId,
        `⚠️ Đã ghi khoản nhưng chưa sắp xếp được bảng ${table}. Lần ghi sau sẽ tự xếp lại.`,
      );
    } catch (sendErr) {
      console.error('gui canh bao don bang that bai:', sendErr);
    }
  }
}
