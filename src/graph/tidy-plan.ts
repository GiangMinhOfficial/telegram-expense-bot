import { DATE_COL, ROW_WIDTH } from './sheet';

/** Dòng trống = cả ba ô rỗng. Graph trả ô rỗng là `''`; `null` và ô thiếu cũng tính. */
const isEmpty = (v: unknown): boolean => v === '' || v === null || v === undefined;
const isBlankRow = (row: unknown[]): boolean => row.slice(0, ROW_WIDTH).every(isEmpty);

/**
 * Các dòng đọc về có đúng thứ tự mà lệnh sắp vừa tạo ra không: ngày tăng dần, dòng
 * thiếu ngày nằm dưới mọi dòng có ngày.
 *
 * Graph có lúc trả về bản đọc CŨ, chưa thấy lệnh sắp. Bản đọc đó không nói đúng dòng
 * nào đang ở đáy bảng, nên không được dùng để quyết định thêm dòng trống.
 */
export function isSortedByDate(rows: unknown[][]): boolean {
  let previous = -Infinity;
  let seenUndated = false;
  for (const row of rows) {
    const date = row[DATE_COL];
    if (typeof date !== 'number') { seenUndated = true; continue; }
    if (seenUndated || date < previous) return false;
    previous = date;
  }
  return true;
}

/**
 * Đáy bảng có thiếu dòng trống không, tính trên các dòng SAU KHI SẮP. Hàm thuần —
 * không cần Env hay Graph để gọi.
 *
 * Dọn bảng chỉ THÊM dòng trống, không bao giờ xoá dòng nào. Bản trước xoá dòng trống
 * thừa theo chỉ số tính trên một bản đọc; gặp bản đọc cũ thì chỉ số đó trỏ vào khoản
 * vừa ghi và đã xoá mất khoản của người dùng. Dòng trống thừa giữa bảng vì thế nằm
 * nguyên, người dùng tự xoá tay nếu muốn.
 */
export function needsBlankRow(rows: unknown[][]): boolean {
  const last = rows[rows.length - 1];
  return !last || !isBlankRow(last);
}
