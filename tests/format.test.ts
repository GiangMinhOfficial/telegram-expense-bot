import { describe, expect, it } from 'vitest';
import { confirmation, formatVND } from '../src/telegram/format';

describe('formatVND', () => {
  it.each([[40_000, '40.000đ'], [3_240_000, '3.240.000đ'], [0, '0đ'], [999, '999đ']])(
    '%i → %s', (n, want) => expect(formatVND(n)).toBe(want));
});

describe('confirmation', () => {
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt',
  };
  const totals = { categoryMonth: 890_000, today: 75_000, monthSpend: 3_240_000 };
  const html = confirmation(entry, totals, true);

  it('có dòng xác nhận đủ 4 mảnh thông tin', () => {
    expect(html).toContain('cơm trưa');
    expect(html).toContain('40.000đ');
    expect(html).toContain('08/08');
    expect(html).toContain('Ăn uống sinh hoạt');
  });
  it('có đủ ba dòng tổng', () => {
    expect(html).toContain('890.000đ');
    expect(html).toContain('75.000đ');
    expect(html).toContain('3.240.000đ');
  });
  it('dùng khối <pre> để các con số thẳng cột', () => expect(html).toContain('<pre>'));
  it('ghi hôm nay → nhãn "Hôm nay"', () => expect(html).toContain('Hôm nay'));
  it('ghi lùi ngày → nhãn là ngày đó, không phải "Hôm nay"', () => {
    const back = confirmation({ ...entry, date: { y: 2026, m: 8, d: 5 } }, totals, false);
    expect(back).toContain('Ngày 05/08');
    expect(back).not.toContain('Hôm nay');
  });
  it('thoát ký tự HTML trong mô tả', () =>
    expect(confirmation({ ...entry, description: 'cơm <b>ngon</b>' }, totals, true))
      .toContain('&lt;b&gt;'));
});
