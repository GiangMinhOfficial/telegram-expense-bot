import { CATEGORIES, sheetName } from '../config';
import type { Env } from '../env';
import {
  LABEL_COL, SPEND_BLOCKS, VALUE_COL, cellAt, colOffset, num, text,
} from '../graph/sheet';
import { readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import { sendMessage } from '../telegram/api';
import { alignedRows, formatVND } from '../telegram/format';

export async function handleToday(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const serial = toExcelSerial(today);

  // Khoản quẹt thẻ hôm nay đã nằm ở sheet tháng sau nếu hôm nay qua mốc chốt.
  // Đọc cả hai rồi lọc theo ngày — không cần biết mốc chốt là bao nhiêu.
  const [cur, next] = await Promise.all([
    readSheet(env, sheetName(today.m)),
    today.m < 12 ? readSheet(env, sheetName(today.m + 1)) : Promise.resolve(null),
  ]);

  const items: [string, string][] = [];
  let total = 0;
  for (const data of [cur, next]) {
    if (!data) continue;
    const off = colOffset(data.address);
    for (const row of data.values) {
      for (const c of SPEND_BLOCKS) {
        const desc = text(cellAt(row, c, off));
        const d = num(cellAt(row, c + 1, off));
        const amt = num(cellAt(row, c + 2, off));
        if (d === serial && amt !== null && desc) {
          items.push([desc.slice(0, 22), formatVND(amt)]);
          total += amt;
        }
      }
    }
  }

  const dm = `${String(today.d).padStart(2, '0')}/${String(today.m).padStart(2, '0')}`;
  await sendMessage(
    env, chatId,
    `<b>Hôm nay ${dm}</b>\n<pre>${alignedRows(items)}</pre>\n<b>Tổng: ${formatVND(total)}</b>`,
  );
}

export async function handleMonth(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const data = await readSheet(env, sheetName(today.m));
  const off = colOffset(data.address);

  const wanted = new Set<string>(Object.values(CATEGORIES).map((c) => c.label));
  const rows: [string, string][] = [];
  let spend = 0;
  let income = 0;

  for (const row of data.values) {
    const label = text(cellAt(row, LABEL_COL, off));
    const v = num(cellAt(row, VALUE_COL, off));
    if (!label || v === null) continue;
    if (label === 'Tổng chi') { spend = v; continue; }
    if (label === CATEGORIES.income.label) { income = v; continue; }
    if (wanted.has(label)) rows.push([label, formatVND(v)]);
  }

  // Nghĩa đã đổi từ khi có tính năng thẻ: đây là tiền RỜI TÀI KHOẢN trong tháng,
  // không phải tiền tiêu trong tháng.
  await sendMessage(
    env, chatId,
    `<b>Tháng ${today.m}</b>\n<pre>${alignedRows(rows)}</pre>\n` +
    `<b>Tổng chi: ${formatVND(spend)}</b>\nThu nhập: ${formatVND(income)}`,
  );
}
