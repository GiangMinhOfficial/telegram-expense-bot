import { describe, expect, it } from 'vitest';
import { planTidy } from '../src/graph/tidy-plan';

const khoan = (n: number) => [`khoản ${n}`, 46_240 + n, 10_000 * n];
const DONG_TRONG = ['', '', ''];

describe('planTidy', () => {
  it('đúng một dòng trống ở đáy → không làm gì', () => {
    expect(planTidy([khoan(1), khoan(2), DONG_TRONG])).toEqual({ deleteIndexes: [], addBlank: false });
  });

  it('không có dòng trống → thêm một dòng', () => {
    expect(planTidy([khoan(1), khoan(2)])).toEqual({ deleteIndexes: [], addBlank: true });
  });

  it('nhiều dòng trống → xoá bớt, giữ dòng đáy, chỉ số từ dưới lên', () => {
    const rows = [DONG_TRONG, khoan(1), DONG_TRONG, khoan(2), DONG_TRONG, DONG_TRONG];
    expect(planTidy(rows)).toEqual({ deleteIndexes: [4, 2, 0], addBlank: false });
  });

  it('dòng trống nằm trên dòng thiếu ngày → xoá và thêm lại ở đáy', () => {
    const thieuNgay = ['gõ tay', '', 50_000];
    expect(planTidy([khoan(1), DONG_TRONG, thieuNgay])).toEqual({ deleteIndexes: [1], addBlank: true });
  });

  it('dòng thiếu một phần không bị xoá', () => {
    const rows = [['gõ dở', '', ''], ['', 46_241, ''], ['', '', 30_000], DONG_TRONG];
    expect(planTidy(rows)).toEqual({ deleteIndexes: [], addBlank: false });
  });

  it('dòng cuối thiếu một phần, không dòng trống → thêm một dòng', () => {
    expect(planTidy([khoan(1), ['gõ dở', '', '']])).toEqual({ deleteIndexes: [], addBlank: true });
  });

  it('null và ô thiếu cũng là ô rỗng', () => {
    const rows = [[null, null, null], khoan(1), [null, null, null]];
    expect(planTidy(rows)).toEqual({ deleteIndexes: [0], addBlank: false });
    expect(planTidy([khoan(1), []])).toEqual({ deleteIndexes: [], addBlank: false });
  });

  it('số 0 và mô tả toàn chữ số không phải ô rỗng', () => {
    expect(planTidy([['quà tặng', 46_240, 0], [100, '', '']])).toEqual({
      deleteIndexes: [], addBlank: true,
    });
  });

  it('bảng rỗng → thêm một dòng', () => {
    expect(planTidy([])).toEqual({ deleteIndexes: [], addBlank: true });
  });
});
