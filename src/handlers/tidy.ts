import type { Env } from '../env';
import { planTidy } from '../graph/tidy-plan';
import {
  appendBlankRow, deleteRow, readTableRows, sortTableByDate,
} from '../graph/workbook';
import { sendMessage } from '../telegram/api';

/**
 * Dọn bảng vừa nhận khoản: sắp theo ngày, rồi chỉnh về đúng một dòng trống ở đáy.
 * Mọi lỗi đổi thành một tin cảnh báo — hàm này không ném.
 */
export async function tidyTable(env: Env, chatId: number, table: string): Promise<void> {
  try {
    await sortTableByDate(env, table);
    const rows = await readTableRows(env, table);
    if (!rows) throw new Error('không đọc được các dòng của bảng sau khi sắp');

    const plan = planTidy(rows);
    // Tuần tự: mỗi lệnh xoá đổi chỉ số của các dòng nằm dưới nó.
    for (const index of plan.deleteIndexes) await deleteRow(env, table, index);
    if (plan.addBlank) await appendBlankRow(env, table);
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
