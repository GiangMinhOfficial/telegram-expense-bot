import { describe, expect, it } from 'vitest';
import { findRowIndex } from '../src/graph/find-row';
import type { RowValues } from '../src/graph/sheet';

const NGAY_8_8 = 46242; // 08/08/2026
const saved: RowValues = ['cơm trưa', NGAY_8_8, 40_000];

describe('findRowIndex', () => {
  it('tìm được dòng đã đổi chỗ so với lúc ghi', () => {
    const rows = [
      ['cà phê', 46_240, 25_000],
      ['cơm trưa', NGAY_8_8, 40_000],
      ['phở', 46_243, 50_000],
      ['', '', ''],
    ];
    expect(findRowIndex(rows, saved)).toBe(1);
  });

  it('nhiều dòng giống hệt → dòng dưới cùng', () => {
    const rows = [
      ['cơm trưa', NGAY_8_8, 40_000],
      ['phở', NGAY_8_8, 50_000],
      ['cơm trưa', NGAY_8_8, 40_000],
      ['', '', ''],
    ];
    expect(findRowIndex(rows, saved)).toBe(2);
  });

  it('không dòng nào khớp → null', () => {
    const rows = [
      ['cơm trưa', NGAY_8_8, 45_000],
      ['cơm trưa', NGAY_8_8 + 1, 40_000],
      ['cơm tối', NGAY_8_8, 40_000],
    ];
    expect(findRowIndex(rows, saved)).toBeNull();
  });

  it('bảng rỗng → null', () => expect(findRowIndex([], saved)).toBeNull());

  it('khớp dòng có tiền tố nguồn', () => {
    for (const prefix of ['[cc] ', '[spl] ', '[zlp] ']) {
      const withPrefix: RowValues = [`${prefix}cơm trưa`, NGAY_8_8, 40_000];
      const rows = [
        ['cơm trưa', NGAY_8_8, 40_000],
        [`${prefix}cơm trưa`, NGAY_8_8, 40_000],
      ];
      expect(findRowIndex(rows, withPrefix)).toBe(1);
    }
  });

  it('dòng không có tiền tố không khớp khoản đã lưu có tiền tố', () => {
    const withPrefix: RowValues = ['[cc] cơm trưa', NGAY_8_8, 40_000];
    expect(findRowIndex([['cơm trưa', NGAY_8_8, 40_000]], withPrefix)).toBeNull();
  });

  it('ô rỗng đọc về là chuỗi rỗng không khớp nhầm với số 0', () => {
    const zero: RowValues = ['cơm trưa', NGAY_8_8, 0];
    expect(findRowIndex([['cơm trưa', NGAY_8_8, '']], zero)).toBeNull();
    expect(findRowIndex([['cơm trưa', '', 0]], ['cơm trưa', 0, 0])).toBeNull();
  });

  it('ô rỗng không khớp mô tả rỗng của khoản đã lưu khi các ô còn lại lệch', () => {
    expect(findRowIndex([['', '', '']], ['', NGAY_8_8, 40_000])).toBeNull();
  });

  it('mô tả toàn chữ số được Excel đọc về là số vẫn khớp', () => {
    expect(findRowIndex([[100, NGAY_8_8, 40_000]], ['100', NGAY_8_8, 40_000])).toBe(0);
  });

  it('số tiền 0 thật vẫn khớp số 0', () => {
    expect(findRowIndex([['quà tặng', NGAY_8_8, 0]], ['quà tặng', NGAY_8_8, 0])).toBe(0);
  });
});
