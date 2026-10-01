import { takeLastWrite } from '../db';
import type { Env } from '../env';
import { findRowIndex } from '../graph/find-row';
import type { RowValues } from '../graph/sheet';
import { deleteRow, readTableRows } from '../graph/workbook';
import { sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';

export async function handleUndo(env: Env, chatId: number): Promise<void> {
  const last = await takeLastWrite(env.DB, chatId);
  if (!last) {
    await sendMessage(env, chatId, 'Không còn gì để hoàn tác.');
    return;
  }

  const expected = JSON.parse(last.valuesJson) as RowValues;
  const [description, , amount] = expected;
  const label = `${description} · ${formatVND(amount)}`;
  const rows = await readTableRows(env, last.tableName);

  if (!rows) {
    await sendMessage(
      env, chatId,
      '⚠️ Không đọc được dòng đó nữa. Không hoàn tác, bạn kiểm tra file giúp.',
    );
    return;
  }

  // Tìm theo nội dung chứ không theo chỉ số đã lưu: dòng có thể đã đổi chỗ.
  // Thà không hoàn tác còn hơn xoá nhầm dòng khác.
  const index = findRowIndex(rows, expected);

  if (index === null) {
    await sendMessage(
      env, chatId,
      `⚠️ Không thấy dòng nào khớp khoản vừa ghi (${label}) ` +
      'trong bảng. Không hoàn tác để tránh xoá nhầm — bạn sửa tay trong Excel giúp.',
    );
    return;
  }

  await deleteRow(env, last.tableName, index);
  await sendMessage(env, chatId, `↩️ Đã hoàn tác: ${label}`);
}
