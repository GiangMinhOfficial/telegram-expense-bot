import { describe, expect, it } from 'vitest';
import { parseMessage } from '../src/parse/message';

const NOW = Date.UTC(2026, 7, 8, 5, 0); // 12:00 ngày 08/08/2026 giờ VN
const SC = { WM: 'Winmart', TC: 'TocoToco', MT: 'Mầm Trà', VM: 'V-mart' };
const parse = (t: string) => parseMessage(t, NOW, SC);
const ok = (t: string) => {
  const r = parse(t);
  if (!r.ok) throw new Error(`kỳ vọng thành công, nhận lỗi: ${r.error}`);
  return r.entry;
};

describe('trường hợp cơ bản', () => {
  it('/food ăn trưa 40k', () => {
    expect(ok('/food ăn trưa 40k')).toEqual({
      category: 'food', description: 'ăn trưa',
      date: { y: 2026, m: 8, d: 8 }, amount: { kind: 'exact', amount: 40_000 },
      source: null,
    });
  });
});

describe('số trong mô tả không bị nhầm là số tiền', () => {
  it('/food cơm 2 người 80k', () => {
    const e = ok('/food cơm 2 người 80k');
    expect(e.description).toBe('cơm 2 người');
    expect(e.amount).toEqual({ kind: 'exact', amount: 80_000 });
  });
});

describe('ngày linh hoạt về vị trí', () => {
  it('ngày ở cuối', () =>
    expect(ok('/food ăn trưa 40k hqua').date).toEqual({ y: 2026, m: 8, d: 7 }));
  it('ngày ở đầu', () => {
    const e = ok('/food 5/8 ăn trưa 40k');
    expect(e.date).toEqual({ y: 2026, m: 8, d: 5 });
    expect(e.description).toBe('ăn trưa');
  });
  it('"hôm qua" hai chữ vẫn nhận', () =>
    expect(ok('/food ăn trưa 40k hôm qua').date).toEqual({ y: 2026, m: 8, d: 7 }));
});

describe('bung mã viết tắt', () => {
  it('/other TC 40k', () => expect(ok('/other TC 40k').description).toBe('TocoToco'));
  it('chỉ bung khi đứng riêng thành từ', () =>
    expect(ok('/other TCxyz 40k').description).toBe('TCxyz'));
});

describe('đánh dấu quẹt thẻ', () => {
  it('không có cc → không phải khoản thẻ', () =>
    expect(ok('/food ăn trưa 40k').source).toBe(null));

  it('cc ở cuối', () => {
    const e = ok('/food ăn trưa 40k cc');
    expect(e.source).toBe('cc');
    expect(e.description).toBe('ăn trưa');
  });

  it('cc ở giữa', () => {
    const e = ok('/food ăn trưa cc 40k');
    expect(e.source).toBe('cc');
    expect(e.description).toBe('ăn trưa');
  });

  it('cc ngay sau lệnh', () => {
    const e = ok('/food cc ăn trưa 40k');
    expect(e.source).toBe('cc');
    expect(e.description).toBe('ăn trưa');
  });

  it('CC viết hoa cũng nhận', () =>
    expect(ok('/food ăn trưa 40k CC').source).toBe('cc'));

  it('gõ hai lần vẫn tính là một', () => {
    const e = ok('/food cc ăn trưa 40k cc');
    expect(e.source).toBe('cc');
    expect(e.description).toBe('ăn trưa');
  });

  it('cc đi cùng ngày lùi', () => {
    const e = ok('/food ăn trưa 40k hqua cc');
    expect(e.source).toBe('cc');
    expect(e.date).toEqual({ y: 2026, m: 8, d: 7 });
    expect(e.description).toBe('ăn trưa');
  });

  it('HỒI QUY: "nạp thẻ" KHÔNG phải khoản quẹt thẻ', () => {
    // "nạp thẻ" là câu bình thường để ghi nạp thẻ điện thoại. Nếu "thẻ" là từ
    // khoá thì khoản này bị đẩy sang tháng sau mà không có dấu hiệu nào báo.
    const e = ok('/other nạp thẻ 100k');
    expect(e.source).toBe(null);
    expect(e.description).toBe('nạp thẻ');
  });

  it('"the" cũng không phải từ khoá', () =>
    expect(ok('/other mua the game 100k').source).toBe(null));

  it('cc dính liền chữ khác thì không phải từ khoá', () => {
    const e = ok('/other ccorp 40k');
    expect(e.source).toBe(null);
    expect(e.description).toBe('ccorp');
  });
});

describe('cc chỉ dùng cho nhóm chi tiêu', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi');
    return r.error;
  };

  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense'])(
    '/%s nhận cc', (c) => expect(ok(`/${c} test 10k cc`).source).toBe('cc'));

  it.each(['income', 'invest', 'saving'])(
    '/%s từ chối cc', (c) => expect(err(`/${c} test 10k cc`)).toMatch(/cc/i));

  it('chỉ có cc và số tiền → thiếu mô tả', () =>
    expect(err('/food cc 40k')).toMatch(/mô tả/i));
});

describe('số tiền mơ hồ được chuyển tiếp nguyên trạng', () => {
  it('/food gửi xe 3000', () =>
    expect(ok('/food gửi xe 3000').amount).toEqual({ kind: 'ambiguous', low: 3_000, high: 3_000_000 }));
});

describe('mọi lệnh hợp lệ', () => {
  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense', 'income', 'invest', 'saving'])(
    '/%s', (c) => expect(ok(`/${c} test 10k`).category).toBe(c));
  it('bỏ qua đuôi @tên_bot', () => expect(ok('/food@my_bot ăn trưa 40k').category).toBe('food'));
});

describe('các ca lỗi', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi');
    return r.error;
  };
  it('lệnh không tồn tại', () => expect(err('/xyz abc 40k')).toMatch(/lệnh/i));
  it('thiếu số tiền', () => expect(err('/food ăn trưa')).toMatch(/số tiền/i));
  it('thiếu mô tả', () => expect(err('/food 40k')).toMatch(/mô tả/i));
  it('chỉ có ngày và tiền', () => expect(err('/food hqua 40k')).toMatch(/mô tả/i));
  it('ngày ngoài năm 2026', () => expect(err('/food ăn trưa 40k 5/8/2027')).toMatch(/2026/));
  it('không phải lệnh', () => expect(err('ăn trưa 40k')).toMatch(/lệnh/i));
});
