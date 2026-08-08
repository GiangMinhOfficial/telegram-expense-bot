import { takeLastWrite } from '../db';
import type { Env } from '../env';
import { deleteRow, readRow } from '../graph/workbook';
import { sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';

export async function handleUndo(env: Env, chatId: number): Promise<void> {
  const last = await takeLastWrite(env.DB, chatId);
  if (!last) {
    await sendMessage(env, chatId, 'Không còn gì để hoàn tác.');
    return;
  }

  const expected = JSON.parse(last.valuesJson) as [string, number, number];
  const actual = await readRow(env, last.tableName, last.rowIndex);

  if (!actual) {
    await sendMessage(
      env, chatId,
      '⚠️ Không đọc được dòng đó nữa. Không hoàn tác, bạn kiểm tra file giúp.',
    );
    return;
  }

  // Đối chiếu trước khi xoá — thà không hoàn tác còn hơn xoá nhầm dòng khác.
  const same =
    String(actual[0] ?? '') === expected[0] &&
    Number(actual[1]) === expected[1] &&
    Number(actual[2]) === expected[2];

  if (!same) {
    await sendMessage(
      env, chatId,
      `⚠️ Dòng ở vị trí cũ giờ là "${String(actual[0] ?? '')}", không khớp khoản vừa ghi. ` +
      'Không hoàn tác để tránh xoá nhầm — bạn sửa tay trong Excel giúp.',
    );
    return;
  }

  await deleteRow(env, last.tableName, last.rowIndex);
  await sendMessage(env, chatId, `↩️ Đã hoàn tác: ${expected[0]} · ${formatVND(expected[2])}`);
}
