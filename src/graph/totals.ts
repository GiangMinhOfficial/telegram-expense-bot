import type { SheetData } from './workbook';

export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng này */
  categoryMonth: number;
  /** Tổng chi của `daySerial` (không gồm thu nhập / đầu tư / tiết kiệm) */
  today: number;
  /** Tổng chi cả tháng */
  monthSpend: number;
}

/** Chỉ số cột 0-based: A=0, E=4, I=8, M=12, N=13. */
const SPEND_BLOCKS = [0, 4] as const; // A:C và E:G — I:K là thu/đầu tư/tiết kiệm
const LABEL_COL = 12;
const VALUE_COL = 13;
const TOTAL_LABEL = 'Tổng chi';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function computeTotals(
  sheet: SheetData, categoryLabel: string, daySerial: number,
): Totals {
  let categoryMonth = 0;
  let monthSpend = 0;
  let today = 0;

  for (const row of sheet.values) {
    // Bảng tổng hợp M:O
    const label = text(row[LABEL_COL]);
    if (label) {
      const v = num(row[VALUE_COL]);
      if (v !== null) {
        if (label === categoryLabel) categoryMonth = v;
        else if (label === TOTAL_LABEL) monthSpend = v;
      }
    }

    // Khối dữ liệu chi tiêu
    for (const c of SPEND_BLOCKS) {
      const date = num(row[c + 1]);
      const amount = num(row[c + 2]);
      if (date === daySerial && amount !== null) today += amount;
    }
  }

  return { categoryMonth, today, monthSpend };
}
