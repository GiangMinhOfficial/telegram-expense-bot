import { describe, expect, it } from 'vitest';
import { DEFERRED_SOURCES } from '../src/config';
import {
  carryOverRefusal, confirmation, formatVND, helpText, reauthCodeFailed, reauthDone, reauthPrompt,
} from '../src/telegram/format';

describe('formatVND', () => {
  it.each([[40_000, '40.000đ'], [3_240_000, '3.240.000đ'], [0, '0đ'], [999, '999đ']])(
    '%i → %s', (n, want) => expect(formatVND(n)).toBe(want));
});

describe('confirmation', () => {
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt',
    source: null, targetMonth: 8,
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
    const s = confirmation({ ...card, source: null, targetMonth: 8 }, CARD_TOTALS, false);
    expect(s).not.toContain('💳');
  });

  it('thẻ không nhảy tháng', () => {
    const s = confirmation(
      { ...card, date: { y: 2026, m: 8, d: 3 }, source: 'hsbc', targetMonth: 8 },
      CARD_TOTALS, false);
    expect(s).toContain('💳 trả tháng 8');
  });

  it('thẻ nhảy tháng nói rõ cả ngày tiêu lẫn tháng trả', () => {
    const s = confirmation({ ...card, source: 'hsbc', targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('💳 tiêu 10/08 → trả tháng 9');
  });

  it('nhãn nhóm mang THÁNG ĐÍCH, không mang tháng phát sinh', () => {
    const s = confirmation({ ...card, source: 'hsbc', targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('Ăn uống sinh hoạt (T9)');
    expect(s).not.toContain('Ăn uống sinh hoạt (T8)');
  });

  it('nhãn tổng chi cũng mang THÁNG ĐÍCH', () => {
    const s = confirmation({ ...card, source: 'hsbc', targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('Tổng chi T9');
    expect(s).not.toContain('Tổng chi T8');
  });

  it('ghi hôm nay thì dòng giữa ghi "Hôm nay"', () => {
    const s = confirmation({ ...card, source: null, targetMonth: 8 }, CARD_TOTALS, true);
    expect(s).toContain('Hôm nay');
  });

  it('ghi lùi ngày thì dòng giữa mang ngày đó', () => {
    const s = confirmation({ ...card, source: null, targetMonth: 8 }, CARD_TOTALS, false);
    expect(s).toContain('Ngày 10/08');
  });
});

describe('confirmation với spl và zlp', () => {
  it('spl hiện đúng emoji 🛍️, không phải 💳', () => {
    const s = confirmation(
      { ...card, date: { y: 2026, m: 8, d: 3 }, source: 'spl', targetMonth: 8 },
      CARD_TOTALS, false);
    expect(s).toContain('🛍️ trả tháng 8');
    expect(s).not.toContain('💳');
  });

  it('zlp hiện đúng emoji 🔵, không phải 💳', () => {
    const s = confirmation(
      { ...card, date: { y: 2026, m: 8, d: 3 }, source: 'zlp', targetMonth: 8 },
      CARD_TOTALS, false);
    expect(s).toContain('🔵 trả tháng 8');
    expect(s).not.toContain('💳');
  });

  it('vpb hiện đúng emoji 🟢, không lẫn với 💳 của hsbc', () => {
    const s = confirmation(
      { ...card, date: { y: 2026, m: 8, d: 3 }, source: 'vpb', targetMonth: 8 },
      CARD_TOTALS, false);
    expect(s).toContain('🟢 trả tháng 8');
    expect(s).not.toContain('💳');
  });

  it('spl nhảy tháng nói rõ cả ngày tiêu lẫn tháng trả', () => {
    const s = confirmation({ ...card, source: 'spl', targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('🛍️ tiêu 10/08 → trả tháng 9');
  });

  it('mô tả trong tin xác nhận không bao giờ mang tiền tố nguồn', () => {
    const s = confirmation({ ...card, source: 'spl', targetMonth: 9 }, CARD_TOTALS, false);
    expect(s).toContain('cơm trưa');
    expect(s).not.toContain('[spl]');
  });
});

describe('helpText — mục Nguồn trả sau', () => {
  const note = { shortcodes: {}, cutoffDays: { hsbc: 7, vpb: 26, spl: 24, zlp: 28 } };
  const html = helpText(note);

  it('liệt kê đủ mọi token', () => {
    expect(html).toContain('hsbc');
    expect(html).toContain('vpb');
    expect(html).toContain('spl');
    expect(html).toContain('zlp');
  });

  it('mỗi token kèm mốc chốt lấy từ cấu hình, không viết cứng ngoài chuỗi', () => {
    for (const [token, s] of Object.entries(DEFERRED_SOURCES)) {
      expect(html).toContain(`<code>${token}</code>`);
      expect(html).toContain(`chốt ngày ${s.defaultCutoffDay}`);
      expect(html).toContain(s.emoji);
      expect(html).toContain(s.label);
    }
  });

  it('mục có tiêu đề "Nguồn trả sau"', () => expect(html).toContain('Nguồn trả sau'));

  it('mốc chốt lấy từ note.cutoffDays, không phải mặc định trong code', () => {
    const overridden = helpText({ shortcodes: {}, cutoffDays: { hsbc: 20, vpb: 26, spl: 24, zlp: 28 } });
    expect(overridden).toContain('chốt ngày 20');
    expect(overridden).not.toContain('chốt ngày 7');
  });
});

describe('carryOverRefusal', () => {
  const e = {
    description: 'cơm trưa', date: { y: 2026, m: 12, d: 10 },
    label: 'Ăn uống sinh hoạt', source: null as null | 'hsbc' | 'vpb' | 'spl' | 'zlp',
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

  it('không có nguồn → không có emoji nguồn nào', () => {
    const s = carryOverRefusal({ ...e, amount: { kind: 'exact', amount: 40_000 } }, err);
    expect(s).not.toMatch(/💳|🟢|🛍️|🔵/);
  });

  it.each([['hsbc', '💳'], ['vpb', '🟢'], ['spl', '🛍️'], ['zlp', '🔵']] as const)(
    'nguồn %s → in kèm emoji %s để biết viết tiền tố nào khi chép tay', (source, emoji) => {
      const s = carryOverRefusal(
        { ...e, source, amount: { kind: 'exact', amount: 40_000 } }, err);
      expect(s).toContain(emoji);
      // Mô tả vẫn là chữ người dùng gõ, không ghép tiền tố dạng [spl] — đó là
      // việc riêng của buildRow.
      expect(s).not.toContain(`[${source}]`);
    });
});

describe('reauthPrompt', () => {
  const html = reauthPrompt('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?a=b');

  it('có link /authorize để mở', () =>
    expect(html).toContain('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'));

  it('nói rõ không cần gửi lại /reauth — luồng tự hoàn tất qua redirect', () =>
    expect(html).toContain('không cần gửi lại /reauth'));

  it('thoát ký tự HTML trong link', () =>
    expect(reauthPrompt('https://x?a=1&b=2')).toContain('a=1&amp;b=2'));
});

describe('reauthCodeFailed', () => {
  const html = reauthCodeFailed('AADSTS70008: mã hết hạn');

  it('nêu nguyên văn lỗi Microsoft trong <code>', () =>
    expect(html).toContain('<code>AADSTS70008: mã hết hạn</code>'));

  it('dặn gửi /reauth để lấy link mới', () => expect(html).toContain('Gửi /reauth'));

  it('thoát ký tự HTML trong lỗi', () =>
    expect(reauthCodeFailed('a<b>c')).toContain('a&lt;b&gt;c'));
});

describe('reauthDone', () => {
  const html = reauthDone('0.AY8-refresh-token');

  it('trả refresh token mới trong <code> để chép vào .dev.vars', () =>
    expect(html).toContain('<code>0.AY8-refresh-token</code>'));

  it('nhắc .dev.vars để biết chép đi đâu', () => expect(html).toContain('.dev.vars'));

  it('cảnh báo chạy script sẽ làm token phía bot chết', () =>
    expect(html).toContain('/reauth lần nữa'));

  it('thoát ký tự HTML trong token', () =>
    expect(reauthDone('a<b>c')).toContain('a&lt;b&gt;c'));
});
