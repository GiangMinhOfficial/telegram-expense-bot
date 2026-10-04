import type { RowValues } from './sheet';

/**
 * Tìm chỉ số dòng khớp khoản đã lưu. Hàm thuần — không cần Env hay Graph để gọi.
 *
 * Hai ô số (serial ngày, số tiền) so chặt theo kiểu, không ép kiểu: Graph trả ô
 * rỗng là `''`, mà `Number('') === 0` sẽ khiến dòng rỗng khớp nhầm khoản 0 đồng.
 * Ô mô tả thì đổi sang chuỗi trước khi so: mô tả toàn chữ số ("100") được Excel
 * lưu thành số và đọc về là số. Mô tả đã gồm tiền tố nguồn (`[cc] `...).
 *
 * Nhiều dòng giống hệt nhau thì lấy dòng dưới cùng — xoá dòng nào cũng cho cùng
 * kết quả, còn dòng dưới cùng là dòng bot vừa nối vào.
 */
export function findRowIndex(
  rows: unknown[][], expected: RowValues,
): number | null {
  const [description, serial, amount] = expected;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row) continue;
    if (String(row[0] ?? '') === description && row[1] === serial && row[2] === amount) return i;
  }
  return null;
}
