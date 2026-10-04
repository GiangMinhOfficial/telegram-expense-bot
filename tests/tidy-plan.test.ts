import { describe, expect, it } from 'vitest';
import { isSortedByDate, needsBlankRow } from '../src/graph/tidy-plan';

const khoan = (n: number) => [`khoản ${n}`, 46_240 + n, 10_000 * n];
const DONG_TRONG = ['', '', ''];

describe('needsBlankRow — đáy bảng có thiếu dòng trống không', () => {
  it('dòng trống ở đáy → không thêm', () =>
    expect(needsBlankRow([khoan(1), khoan(2), DONG_TRONG])).toBe(false));

  it('không có dòng trống → thêm một dòng', () =>
    expect(needsBlankRow([khoan(1), khoan(2)])).toBe(true));

  it('nhiều dòng trống ở đáy → không thêm, và cũng không xoá bớt', () =>
    expect(needsBlankRow([khoan(1), DONG_TRONG, DONG_TRONG])).toBe(false));

  it('dòng trống nằm giữa bảng, đáy là khoản → thêm một dòng ở đáy', () =>
    expect(needsBlankRow([khoan(1), DONG_TRONG, ['gõ tay', '', 50_000]])).toBe(true));

  it('dòng cuối thiếu một phần không phải dòng trống → thêm một dòng', () =>
    expect(needsBlankRow([khoan(1), ['gõ dở', '', '']])).toBe(true));

  it('null và ô thiếu cũng là ô rỗng', () => {
    expect(needsBlankRow([khoan(1), [null, null, null]])).toBe(false);
    expect(needsBlankRow([khoan(1), []])).toBe(false);
  });

  it('số 0 và mô tả toàn chữ số không phải ô rỗng', () => {
    expect(needsBlankRow([['quà tặng', 46_240, 0]])).toBe(true);
    expect(needsBlankRow([khoan(1), [100, '', '']])).toBe(true);
  });

  it('bảng rỗng → thêm một dòng', () => expect(needsBlankRow([])).toBe(true));
});

describe('isSortedByDate — bản đọc đã thấy lệnh sắp hay chưa', () => {
  it('ngày tăng dần, dòng trống ở đáy → đã sắp', () =>
    expect(isSortedByDate([khoan(1), khoan(2), DONG_TRONG])).toBe(true));

  it('cùng ngày đứng cạnh nhau vẫn là đã sắp', () =>
    expect(isSortedByDate([khoan(1), khoan(1), khoan(2)])).toBe(true));

  it('dòng thiếu ngày nằm dưới mọi dòng có ngày → đã sắp', () =>
    expect(isSortedByDate([khoan(1), ['gõ tay', '', 50_000], DONG_TRONG])).toBe(true));

  it('bảng rỗng → đã sắp', () => expect(isSortedByDate([])).toBe(true));

  it('HỒI QUY: bản đọc cũ — khoản vừa ghi còn nằm dưới dòng trống → chưa sắp', () => {
    // Đúng ca đã làm mất khoản 160k: bảng thật đã sắp thành [.., khoản mới, trống],
    // còn bản đọc cũ vẫn là [.., trống, khoản mới].
    const stale = [khoan(1), khoan(2), DONG_TRONG, khoan(3)];
    expect(isSortedByDate(stale)).toBe(false);
  });

  it('ngày lùi xuống → chưa sắp', () =>
    expect(isSortedByDate([khoan(2), khoan(1), DONG_TRONG])).toBe(false));
});
