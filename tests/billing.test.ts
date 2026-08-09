import { describe, expect, it } from 'vitest';
import { paymentMonth } from '../src/billing';

const d = (m: number, day: number) => ({ y: 2026, m, d: day });
const month = (m: number, day: number, isCard: boolean, cutoff = 7) => {
  const r = paymentMonth(d(m, day), isCard, cutoff);
  if (!r.ok) throw new Error(`kỳ vọng thành công, nhận lỗi: ${r.error}`);
  return r.month;
};

describe('tiền mặt luôn nằm ở tháng phát sinh', () => {
  it.each([1, 6, 7, 8, 20, 31])('ngày %i', (day) =>
    expect(month(8, day, false)).toBe(8));
});

describe('thẻ đi theo kỳ sao kê', () => {
  it.each([1, 2, 6])('ngày %i trước mốc → tháng đó', (day) =>
    expect(month(8, day, true)).toBe(8));

  it('ĐÚNG NGÀY MỐC → tháng đó (kỳ sao kê đóng vào hết ngày mùng 7)', () =>
    expect(month(8, 7, true)).toBe(8));

  it.each([8, 9, 15, 31])('ngày %i sau mốc → tháng sau', (day) =>
    expect(month(8, day, true)).toBe(9));

  it('tháng 11 sang tháng 12 vẫn chạy', () =>
    expect(month(11, 20, true)).toBe(12));
});

describe('mốc chốt lấy từ tham số, không viết cứng', () => {
  it('mốc 4: ngày 4 → tháng đó', () =>
    expect(month(8, 4, true, 4)).toBe(8));

  it('mốc 4: ngày 5 → tháng sau (mốc 7 thì vẫn là tháng đó)', () => {
    expect(month(8, 5, true, 4)).toBe(9);
    expect(month(8, 5, true, 7)).toBe(8);
  });
});

describe('khoản thẻ vắt sang năm sau', () => {
  it('tháng 12 sau mốc → từ chối', () => {
    const r = paymentMonth(d(12, 10), true, 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1\/2027/);
  });

  it('tháng 12 trước mốc vẫn ghi được vào tháng 12', () =>
    expect(month(12, 3, true)).toBe(12));

  it('tháng 12 tiền mặt không bị ảnh hưởng', () =>
    expect(month(12, 25, false)).toBe(12));
});
