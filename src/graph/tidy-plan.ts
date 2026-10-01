import { ROW_WIDTH } from './sheet';

export interface TidyPlan {
  /** Chỉ số dòng cần xoá, xếp từ dưới lên để xoá dòng này không làm trôi chỉ số dòng kia. */
  deleteIndexes: number[];
  /** Đáy bảng chưa có dòng trống nào để giữ lại. */
  addBlank: boolean;
}

/** Dòng trống = cả ba ô rỗng. Graph trả ô rỗng là `''`; `null` và ô thiếu cũng tính. */
const isEmpty = (v: unknown): boolean => v === '' || v === null || v === undefined;
const isBlankRow = (row: unknown[]): boolean => row.slice(0, ROW_WIDTH).every(isEmpty);

/**
 * Kế hoạch đưa bảng về đúng một dòng trống ở đáy, tính trên các dòng SAU KHI SẮP.
 * Hàm thuần — không cần Env hay Graph để gọi.
 *
 * Lệnh sắp không tự đưa dòng trống về đáy khi bảng có dòng thiếu ngày (với Excel
 * hai loại bằng nhau), nên phải chỉnh tay: dòng cuối là dòng trống thì giữ nó và xoá
 * mọi dòng trống khác; dòng cuối không trống thì xoá mọi dòng trống rồi thêm một dòng.
 * Dòng thiếu một phần không phải dòng trống — không bao giờ bị xoá.
 */
export function planTidy(rows: unknown[][]): TidyPlan {
  const last = rows.length - 1;
  const keepsBottom = last >= 0 && isBlankRow(rows[last] ?? []);

  const deleteIndexes: number[] = [];
  for (let i = last; i >= 0; i--) {
    if (keepsBottom && i === last) continue;
    if (isBlankRow(rows[i] ?? [])) deleteIndexes.push(i);
  }
  return { deleteIndexes, addBlank: !keepsBottom };
}
