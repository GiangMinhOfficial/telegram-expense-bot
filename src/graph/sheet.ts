export interface SheetData {
  /** Ví dụ: "Tháng 8!A1:O39" hoặc "Note!E4:K12" */
  address: string;
  values: unknown[][];
}

/**
 * Chỉ số cột (0-based) của ô đầu tiên trong vùng đã đọc.
 *
 * `usedRange` trả về từ ô CÓ DỮ LIỆU đầu tiên chứ không phải từ A1. Sheet `Note`
 * trống cột A–D nên nó bắt đầu ở E4, khiến mọi chỉ số cột tuyệt đối lệch đi 4 —
 * đúng lỗi đã khiến bảng mã viết tắt im lặng không chạy.
 */
export function colOffset(address: string): number {
  const m = /!\$?([A-Z]+)\$?\d+/.exec(address);
  if (!m?.[1]) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Đọc ô theo chỉ số cột TUYỆT ĐỐI (A=0, E=4, M=12), đã bù trừ offset.
 * Cột nằm trước vùng đã đọc trả về `undefined` chứ không cuộn sang ô khác.
 */
export function cellAt(row: unknown[], absCol: number, offset: number): unknown {
  const i = absCol - offset;
  return i >= 0 ? row[i] : undefined;
}

/** Ba ô một khoản ghi vào bảng chi tiêu: mô tả (đã gồm tiền tố nguồn), serial ngày, số tiền. */
export type RowValues = [description: string, serial: number, amount: number];

/** Số ô một dòng của bảng chi tiêu, và chỉ số cột Ngày TRONG BẢNG (0-based). */
export const ROW_WIDTH = 3;
export const DATE_COL = 1;

// ── Bố cục sheet tháng ────────────────────────────────────────────────────
// Trước đây `totals.ts` và `query.ts` mỗi file giữ một bản sao của khối này.
// Gom về đây để sửa bố cục sheet chỉ phải sửa một chỗ.

/** Cột đầu của các khối chi tiêu: A:C và E:G. I:K là thu nhập/đầu tư/tiết kiệm. */
export const SPEND_BLOCKS = [0, 4] as const;

/** Bảng tổng hợp M:O — M là nhãn phân loại, N là số tiền. */
export const LABEL_COL = 12;
export const VALUE_COL = 13;

export const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
