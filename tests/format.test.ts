import { describe, expect, it } from 'vitest';
import { carryOverRefusal, confirmation, formatVND } from '../src/telegram/format';

describe('formatVND', () => {
  it.each([[40_000, '40.000đ'], [3_240_000, '3.240.000đ'], [0, '0đ'], [999, '999đ']])(
    '%i → %s', (n, want) => expect(formatVND(n)).toBe(want));
});

describe('confirmation', () => {
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt',
    isCard: false, targetMonth: 8,
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
  it('nhãn nhóm luôn có số tháng, không bao giờ là undefined', () =>
    expect(html).toContain('(T8)'));
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

const CARD_TOTALS = { categoryMonth: 215_000, today: 117_000, monthSpend: 2_503_667 };
const card = {
  description: 'cơm trưa', amount: 40_000,
  date: { y: 2026, m: 8, d: 10 }, label: 'Ăn uống sinh hoạt',
};

describe('confirmation với khoản thẻ', () => {
  it('tiền mặt không có dòng thẻ', () => {
    const s = confirmation({ ...card, isCard: false, targetMonth: 8 }, CARD_TOTALS, false);
    expect(s).not.toContain('💳');
  });

  it('thẻ không nhảy tháng', () => {
    const s = confirmation(
      { ...card, date: { y: 2026, m: 8, d: 3 }, isCard: true, targetMonth: 8 },
      CARD_TOTALS, false);
    expect(s).toContain('💳 trả tháng 8');
  });

  it('thẻ nhảy tháng nói rõ cả ngày tiêu lẫn tháng trả', () => {
    const s = confirmation({ ...card, isCard: true, targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('💳 tiêu 10/08 → trả tháng 9');
  });

  it('nhãn nhóm mang THÁNG ĐÍCH, không mang tháng phát sinh', () => {
    const s = confirmation({ ...card, isCard: true, targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('Ăn uống sinh hoạt (T9)');
    expect(s).not.toContain('Ăn uống sinh hoạt (T8)');
  });

  it('nhãn tổng chi cũng mang THÁNG ĐÍCH', () => {
    const s = confirmation({ ...card, isCard: true, targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('Tổng chi T9');
    expect(s).not.toContain('Tổng chi T8');
  });

  it('ghi hôm nay thì dòng giữa ghi "Hôm nay"', () => {
    const s = confirmation({ ...card, isCard: false, targetMonth: 8 }, CARD_TOTALS, true);
    expect(s).toContain('Hôm nay');
  });

  it('ghi lùi ngày thì dòng giữa mang ngày đó', () => {
    const s = confirmation({ ...card, isCard: false, targetMonth: 8 }, CARD_TOTALS, false);
    expect(s).toContain('Ngày 10/08');
  });
});

describe('carryOverRefusal', () => {
  const e = {
    description: 'cơm trưa', date: { y: 2026, m: 12, d: 10 },
    label: 'Ăn uống sinh hoạt',
  };
  const err = 'Khoản này rơi vào kỳ trả tháng 1/2027 — file 2026 chưa có chỗ.';

  it('in lại đủ mô tả, số tiền, ngày để chép tay', () => {
    const s = carryOverRefusal(
      { ...e, amount: { kind: 'exact', amount: 40_000 } }, err);
    expect(s).toContain('cơm trưa');
    expect(s).toContain('40.000đ');
    expect(s).toContain('10/12');
    expect(s).toContain('1/2027');
  });

  it('số tiền mơ hồ thì in cả hai khả năng', () => {
    const s = carryOverRefusal(
      { ...e, amount: { kind: 'ambiguous', low: 3_000, high: 3_000_000 } }, err);
    expect(s).toContain('3.000đ');
    expect(s).toContain('3.000.000đ');
  });
});
