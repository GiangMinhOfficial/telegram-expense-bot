import {
  LABEL_COL, SPEND_BLOCKS, type SheetData, VALUE_COL, cellAt, colOffset, num, text,
} from './sheet';

export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng ĐÍCH */
  categoryMonth: number;
  /** Tổng chi của `daySerial` (không gồm thu nhập / đầu tư / tiết kiệm) */
  today: number;
  /** Tổng chi cả tháng ĐÍCH */
  monthSpend: number;
}

const TOTAL_LABEL = 'Tổng chi';

/**
 * Tổng chi của một ngày trên MỘT sheet.
 *
 * Tách riêng vì khoản quẹt thẻ nhảy tháng nằm ở sheet tháng thanh toán, còn chi
 * tiền mặt cùng ngày nằm ở sheet tháng phát sinh — phải cộng cả hai mới đúng.
 */
export function sumDay(sheet: SheetData, daySerial: number): number {
  const off = colOffset(sheet.address);
  let total = 0;
  for (const row of sheet.values) {
    for (const c of SPEND_BLOCKS) {
      const date = num(cellAt(row, c + 1, off));
      const amount = num(cellAt(row, c + 2, off));
      if (date === daySerial && amount !== null) total += amount;
    }
  }
  return total;
}

export function computeTotals(
  sheet: SheetData, categoryLabel: string, daySerial: number,
): Totals {
  const off = colOffset(sheet.address);
  let categoryMonth = 0;
  let monthSpend = 0;

  for (const row of sheet.values) {
    const label = text(cellAt(row, LABEL_COL, off));
    if (!label) continue;
    const v = num(cellAt(row, VALUE_COL, off));
    if (v === null) continue;
    if (label === categoryLabel) categoryMonth = v;
    else if (label === TOTAL_LABEL) monthSpend = v;
  }

  return { categoryMonth, today: sumDay(sheet, daySerial), monthSpend };
}
