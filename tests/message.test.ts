import { describe, expect, it } from 'vitest';
import { legacySource, parseMessage } from '../src/parse/message';

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
  it('không có hsbc → không phải khoản thẻ', () =>
    expect(ok('/food ăn trưa 40k').source).toBe(null));

  it('hsbc ở cuối', () => {
    const e = ok('/food ăn trưa 40k hsbc');
    expect(e.source).toBe('hsbc');
    expect(e.description).toBe('ăn trưa');
  });

  it('hsbc ở giữa', () => {
    const e = ok('/food ăn trưa hsbc 40k');
    expect(e.source).toBe('hsbc');
    expect(e.description).toBe('ăn trưa');
  });

  it('hsbc ngay sau lệnh', () => {
    const e = ok('/food hsbc ăn trưa 40k');
    expect(e.source).toBe('hsbc');
    expect(e.description).toBe('ăn trưa');
  });

  it('HSBC viết hoa cũng nhận', () =>
    expect(ok('/food ăn trưa 40k HSBC').source).toBe('hsbc'));

  it('gõ hai lần vẫn tính là một', () => {
    const e = ok('/food hsbc ăn trưa 40k hsbc');
    expect(e.source).toBe('hsbc');
    expect(e.description).toBe('ăn trưa');
  });

  it('hsbc đi cùng ngày lùi', () => {
    const e = ok('/food ăn trưa 40k hqua hsbc');
    expect(e.source).toBe('hsbc');
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

  it('hsbc dính liền chữ khác thì không phải từ khoá', () => {
    const e = ok('/other hsbcorp 40k');
    expect(e.source).toBe(null);
    expect(e.description).toBe('hsbcorp');
  });
});

describe('thẻ VPBank và chữ cc cũ', () => {
  it('vpb được bóc khỏi mô tả, ở đâu trong câu cũng vậy', () => {
    for (const t of ['/food ăn trưa 40k vpb', '/food vpb ăn trưa 40k', '/food ăn trưa 40k VPB']) {
      const e = ok(t);
      expect(e.source).toBe('vpb');
      expect(e.description).toBe('ăn trưa');
    }
  });

  it('cc không còn là token: ở lại trong mô tả, khoản không có nguồn', () => {
    const e = ok('/food ăn trưa 40k cc');
    expect(e.source).toBe(null);
    expect(e.description).toBe('ăn trưa cc');
  });

  it('cc đi cùng một token thật thì không tính là nguồn thứ hai', () => {
    const e = ok('/food ăn trưa cc 40k vpb');
    expect(e.source).toBe('vpb');
    expect(e.description).toBe('ăn trưa cc');
  });

  it('hsbc và vpb cùng lúc → lỗi', () => {
    const r = parse('/food ăn trưa 40k hsbc vpb');
    expect(r.ok).toBe(false);
  });
});

describe('legacySource: bản ghi tạo ra trước khi đổi token', () => {
  it('source "cc" cũ → hsbc', () => expect(legacySource({ source: 'cc' })).toBe('hsbc'));
  it('isCard cũ → hsbc', () => expect(legacySource({ isCard: true })).toBe('hsbc'));
  it('nguồn hiện hành giữ nguyên', () => {
    expect(legacySource({ source: 'vpb' })).toBe('vpb');
    expect(legacySource({ source: 'spl', isCard: true })).toBe('spl');
  });
  it('không có nguồn → null', () => {
    expect(legacySource({})).toBe(null);
    expect(legacySource({ source: null, isCard: false })).toBe(null);
  });
});

describe('hsbc chỉ dùng cho nhóm chi tiêu', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi');
    return r.error;
  };

  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense'])(
    '/%s nhận hsbc', (c) => expect(ok(`/${c} test 10k hsbc`).source).toBe('hsbc'));

  it.each(['income', 'invest', 'saving'])(
    '/%s từ chối hsbc', (c) => expect(err(`/${c} test 10k hsbc`)).toMatch(/hsbc/i));

  it('chỉ có hsbc và số tiền → thiếu mô tả', () =>
    expect(err('/food hsbc 40k')).toMatch(/mô tả/i));
});

describe('đánh dấu spl và zlp', () => {
  it('spl ở cuối', () => {
    const e = ok('/food mua áo 250k spl');
    expect(e.source).toBe('spl');
    expect(e.description).toBe('mua áo');
  });

  it('zlp ở giữa', () => {
    const e = ok('/food trả góp zlp 300k');
    expect(e.source).toBe('zlp');
    expect(e.description).toBe('trả góp');
  });

  it('SPL/ZLP viết hoa cũng nhận', () => {
    expect(ok('/food mua áo 250k SPL').source).toBe('spl');
    expect(ok('/food trả góp 300k ZLP').source).toBe('zlp');
  });

  it('gõ spl hai lần vẫn tính là một', () => {
    const e = ok('/food spl mua áo 250k spl');
    expect(e.source).toBe('spl');
    expect(e.description).toBe('mua áo');
  });

  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense'])(
    '/%s nhận spl và zlp', (c) => {
      expect(ok(`/${c} test 10k spl`).source).toBe('spl');
      expect(ok(`/${c} test 10k zlp`).source).toBe('zlp');
    });

  it.each(['income', 'invest', 'saving'])(
    '/%s từ chối spl và zlp', (c) => {
      const err = (t: string) => {
        const r = parse(t);
        if (r.ok) throw new Error('kỳ vọng lỗi');
        return r.error;
      };
      expect(err(`/${c} test 10k spl`)).toMatch(/spl/i);
      expect(err(`/${c} test 10k zlp`)).toMatch(/zlp/i);
    });

  it('"ví" và "td" không phải token nguồn', () => {
    expect(ok('/other nạp ví 100k').source).toBe(null);
    expect(ok('/other nạp td 100k').source).toBe(null);
  });
});

describe('hai token nguồn khác nhau trong một tin → báo lỗi', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi, nhận nguồn: ' + r.entry.source);
    return r.error;
  };

  it('hsbc và spl cùng lúc → lỗi, không lấy token cuối', () =>
    expect(err('/food ăn trưa 40k hsbc spl')).toMatch(/nguồn trả sau/i));

  it('spl và zlp cùng lúc → lỗi', () =>
    expect(err('/food ăn trưa 40k spl zlp')).toMatch(/nguồn trả sau/i));
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
