import { describe, expect, it } from 'vitest';
import { findRowIndex } from '../src/graph/find-row';

const T = 46242; // 08/08/2026
const saved: [string, number, number] = ['cơm trưa', T, 40_000];

describe('findRowIndex', () => {
  it('tìm được dòng đã đổi chỗ so với lúc ghi', () => {
    const rows = [
      ['cà phê', 46_240, 25_000],
      ['cơm trưa', T, 40_000],
      ['phở', 46_243, 50_000],
      ['', '', ''],
    ];
    expect(findRowIndex(rows, saved)).toBe(1);
  });

  it('nhiều dòng giống hệt → dòng dưới cùng', () => {
    const rows = [
      ['cơm trưa', T, 40_000],
      ['phở', T, 50_000],
      ['cơm trưa', T, 40_000],
      ['', '', ''],
    ];
    expect(findRowIndex(rows, saved)).toBe(2);
  });

  it('không dòng nào khớp → null', () => {
    const rows = [
      ['cơm trưa', T, 45_000],
      ['cơm trưa', T + 1, 40_000],
      ['cơm tối', T, 40_000],
    ];
    expect(findRowIndex(rows, saved)).toBeNull();
  });

  it('bảng rỗng → null', () => expect(findRowIndex([], saved)).toBeNull());

  it('khớp dòng có tiền tố nguồn', () => {
    for (const prefix of ['[cc] ', '[spl] ', '[zlp] ']) {
      const withPrefix: [string, number, number] = [`${prefix}cơm trưa`, T, 40_000];
      const rows = [
        ['cơm trưa', T, 40_000],
        [`${prefix}cơm trưa`, T, 40_000],
      ];
      expect(findRowIndex(rows, withPrefix)).toBe(1);
    }
  });

  it('dòng không có tiền tố không khớp khoản đã lưu có tiền tố', () => {
    const withPrefix: [string, number, number] = ['[cc] cơm trưa', T, 40_000];
    expect(findRowIndex([['cơm trưa', T, 40_000]], withPrefix)).toBeNull();
  });

  it('ô rỗng đọc về là chuỗi rỗng không khớp nhầm với số 0', () => {
    const zero: [string, number, number] = ['cơm trưa', T, 0];
    expect(findRowIndex([['cơm trưa', T, '']], zero)).toBeNull();
    expect(findRowIndex([['cơm trưa', '', 0]], ['cơm trưa', 0, 0])).toBeNull();
  });

  it('ô rỗng không khớp mô tả rỗng của khoản đã lưu khi các ô còn lại lệch', () => {
    expect(findRowIndex([['', '', '']], ['', T, 40_000])).toBeNull();
  });

  it('mô tả toàn chữ số được Excel đọc về là số vẫn khớp', () => {
    expect(findRowIndex([[100, T, 40_000]], ['100', T, 40_000])).toBe(0);
  });

  it('số tiền 0 thật vẫn khớp số 0', () => {
    expect(findRowIndex([['quà tặng', T, 0]], ['quà tặng', T, 0])).toBe(0);
  });
});
