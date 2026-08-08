import { describe, expect, it } from 'vitest';
import { parseDateToken, toExcelSerial, vnToday } from '../src/parse/date';

const TODAY = { y: 2026, m: 8, d: 8 };

describe('vnToday — quy đổi UTC+7', () => {
  it('23:30 giờ VN vẫn là ngày hôm đó', () => {
    // 2026-08-08 23:30 VN  =  2026-08-08 16:30 UTC
    expect(vnToday(Date.UTC(2026, 7, 8, 16, 30))).toEqual({ y: 2026, m: 8, d: 8 });
  });
  it('00:30 giờ VN đã là ngày mới', () => {
    // 2026-08-09 00:30 VN  =  2026-08-08 17:30 UTC
    expect(vnToday(Date.UTC(2026, 7, 8, 17, 30))).toEqual({ y: 2026, m: 8, d: 9 });
  });
});

describe('toExcelSerial', () => {
  it.each([
    [{ y: 2026, m: 1, d: 1 }, 46023],
    [{ y: 2026, m: 8, d: 3 }, 46237],
    [{ y: 2026, m: 8, d: 8 }, 46242],
  ])('%o → %i', (d, want) => expect(toExcelSerial(d)).toBe(want));
});

describe('parseDateToken', () => {
  it.each(['hnay', 'homnay', 'hômnay'])('%s → hôm nay', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 8 }));
  it.each(['hqua', 'hq', 'homqua', 'hômqua'])('%s → hôm qua', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 7 }));
  it.each(['hkia', 'homkia'])('%s → hôm kia', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 6 }));

  it.each([
    ['5/8', { y: 2026, m: 8, d: 5 }],
    ['05/08', { y: 2026, m: 8, d: 5 }],
    ['5-8', { y: 2026, m: 8, d: 5 }],
    ['8/8/2026', { y: 2026, m: 8, d: 8 }],
    ['8/8/26', { y: 2026, m: 8, d: 8 }],
  ])('%s → %o', (t, want) => expect(parseDateToken(t, TODAY)).toEqual(want));

  it('quy ước ngày/tháng, không phải tháng/ngày', () =>
    expect(parseDateToken('5/8', TODAY)).toEqual({ y: 2026, m: 8, d: 5 }));

  it('lùi qua ranh giới tháng', () =>
    expect(parseDateToken('hqua', { y: 2026, m: 8, d: 1 })).toEqual({ y: 2026, m: 7, d: 31 }));

  it.each(['cơm', '40k', '', '32/8', '5/13', 'abc'])('%s → null', (t) =>
    expect(parseDateToken(t, TODAY)).toBeNull());

  it('ngày không tồn tại không được cuộn sang tháng sau', () =>
    expect(parseDateToken('31/2', TODAY)).toBeNull());
});
