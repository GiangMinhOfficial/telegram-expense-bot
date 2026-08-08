import { describe, expect, it } from 'vitest';
import { computeTotals } from '../src/graph/totals';

const T = 46242; // 08/08/2026
const e = '';

/** Dựng sheet giả theo đúng bố cục thật: A..O là 15 cột. */
const row = (cells: Record<number, unknown>): unknown[] =>
  Array.from({ length: 15 }, (_, i) => cells[i] ?? e);

const sheet = {
  address: 'Tháng 8!A1:O10',
  values: [
    /* r1  */ row({ 0: 'Ăn uống sinh hoạt', 12: 'Phân loại', 13: 'Số tiền' }),
    /* r2  */ row({ 0: 'Mô tả chi tiêu', 1: 'Ngày', 2: 'số tiền', 12: 'Ăn uống sinh hoạt', 13: 890_000 }),
    /* r3  */ row({ 4: 'bạc xỉu', 5: T, 6: 20_000, 12: 'Linh tinh', 13: 37_000 }),
    /* r4  */ row({ 0: 'cơm trưa', 1: T, 2: 40_000, 12: 'Chi tiêu bắt buộc', 13: 2_000_000 }),
    /* r5  */ row({ 0: 'cơm tối', 1: 46_241, 2: 35_000, 12: 'Chi tiêu khác', 13: 143_000 }),
    /* r6  */ row({ 4: 'xúc xích', 5: T, 6: 17_000, 12: 'Phương tiện di chuyển', 13: 0 }),
    /* r7  */ row({ 12: 'Ăn ngoài', 13: 170_000 }),
    /* r8  */ row({ 8: 'Mẹ trả nợ', 9: T, 10: 3_000_000, 12: 'Tổng chi', 13: 3_240_000 }),
    /* r9  */ row({ 0: '    Tổng cộng      ', 2: 890_000, 12: 'Thu nhập', 13: 3_000_000 }),
  ],
};

describe('computeTotals', () => {
  it('lấy tổng nhóm từ bảng M:O', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).categoryMonth).toBe(890_000));

  it('lấy Tổng chi từ bảng M:O', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).monthSpend).toBe(3_240_000));

  it('cộng đúng các khoản chi hôm nay từ khối A:C và E:G', () =>
    // 40.000 (A:C r4) + 20.000 (E:G r3) + 17.000 (E:G r6) = 77.000
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBe(77_000));

  it('KHÔNG tính khối I:K vào chi hôm nay', () => {
    // "Mẹ trả nợ" 3.000.000 ở I:K cùng ngày nhưng là thu nhập.
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBeLessThan(3_000_000);
  });

  it('bỏ qua dòng Tổng cộng vì ô ngày trống', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBe(77_000));

  it('ngày khác cho tổng khác — dùng cho ghi lùi ngày', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', 46_241).today).toBe(35_000));

  it('nhóm không có trong bảng M:O → 0', () =>
    expect(computeTotals(sheet, 'Không tồn tại', T).categoryMonth).toBe(0));

  it('sheet rỗng → tất cả 0', () =>
    expect(computeTotals({ address: 'Tháng 9!A1:A1', values: [] }, 'Ăn uống sinh hoạt', T))
      .toEqual({ categoryMonth: 0, today: 0, monthSpend: 0 }));
});
