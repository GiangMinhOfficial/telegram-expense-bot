import { describe, expect, it } from 'vitest';
import { parseNote } from '../src/note';

/** Đúng hình dạng usedRange thật của sheet Note: bắt đầu ở E4, cột E..K. */
const usedRangeShape = {
  address: 'Note!E4:K12',
  values: [
    ['WM', 'Winmart', '', '', '', '/food', 'Ăn uống sinh hoạt'],
    ['TC', 'TocoToco', '', '', '', '/other', 'Linh tinh'],
    ['MT', 'Mầm Trà', '', '', '', '/force', 'Chi tiêu bắt buộc'],
    ['VM', 'V-mart', '', '', '', '/other_expense', 'Chi tiêu khác'],
    ['', '', '', '', '', '/transport', 'Phương tiện di chuyển'],
  ],
};

/** Khối H–I trong cùng vùng lệch E4: H là cột chỉ số 3 của mảng (E,F,G,H,...). */
const usedRangeWithCutoffs = {
  address: 'Note!E4:K12',
  values: [
    ['WM', 'Winmart', '', 'cc', 24, '', ''],
    ['TC', 'TocoToco', '', 'spl', 20, '', ''],
    ['MT', 'Mầm Trà', '', 'zlp', 15, '', ''],
  ],
};

/** Vùng cố định A1:K6 — cái mà loadNote thật sự đọc. Cột A..K = chỉ số 0..10. */
const fixedRange = (rows: unknown[][]) => ({ address: 'Note!A1:K6', values: rows });

/** Một dòng của khối H–I trong vùng cố định: token ở H (chỉ số 7), mốc ở I (chỉ số 8). */
const hi = (token: unknown, cutoff: unknown): unknown[] =>
  ['', '', '', '', '', '', '', token, cutoff, '', ''];

describe('bảng mã viết tắt', () => {
  it('HỒI QUY: vùng bắt đầu từ E4 vẫn đọc được mã — lỗi này đã lên production', () => {
    expect(parseNote(usedRangeShape).shortcodes).toEqual({
      WM: 'Winmart', TC: 'TocoToco', MT: 'Mầm Trà', VM: 'V-mart',
    });
  });

  it('vùng cố định bắt đầu từ A1 cũng đọc được', () =>
    expect(parseNote(fixedRange([
      ['', '', '', '', 'WM', 'Winmart', '', '', '', '', ''],
      ['', '', '', '', 'TC', 'TocoToco', '', '', '', '', ''],
      ['', '', '', '', 'VM', 'V-mart', '', '', '', '', ''],
    ])).shortcodes).toEqual({ WM: 'Winmart', TC: 'TocoToco', VM: 'V-mart' }));

  it('viết thường trong file vẫn tra được bằng chữ hoa', () =>
    expect(parseNote({
      address: 'Note!A1:F4',
      values: [['', '', '', '', 'wm', 'Winmart']],
    }).shortcodes).toEqual({ WM: 'Winmart' }));

  it('dòng thiếu tên đầy đủ thì bỏ qua', () =>
    expect(parseNote({
      address: 'Note!A1:F4',
      values: [['', '', '', '', 'XX', '   ']],
    }).shortcodes).toEqual({}));
});

describe('mốc chốt sao kê — khối H (token) / I (ngày chốt)', () => {
  it('đọc đúng mốc của cả ba nguồn', () =>
    expect(parseNote(fixedRange([hi('cc', 20), hi('spl', 22), hi('zlp', 15)])).cutoffDays)
      .toEqual({ cc: 20, spl: 22, zlp: 15 }));

  it('HỒI QUY: vùng usedRange lệch kiểu Note!E4:K12 vẫn đọc đúng khối H–I', () =>
    expect(parseNote(usedRangeWithCutoffs).cutoffDays).toEqual({ cc: 24, spl: 20, zlp: 15 }));

  it('chuỗi số cũng nhận', () =>
    expect(parseNote(fixedRange([hi('cc', '20')])).cutoffDays.cc).toBe(20));

  it('token viết hoa hoặc có khoảng trắng vẫn nhận diện được', () =>
    expect(parseNote(fixedRange([hi(' CC ', 20)])).cutoffDays.cc).toBe(20));

  it('token lạ ở cột H bị bỏ qua, không làm hỏng gì', () =>
    expect(parseNote(fixedRange([hi('xyz', 20)])).cutoffDays)
      .toEqual({ cc: 7, spl: 24, zlp: 28 }));

  it('giá trị rỗng → mặc định của đúng nguồn đó', () =>
    expect(parseNote(fixedRange([hi('spl', '')])).cutoffDays.spl).toBe(24));

  it('không phải số nguyên → mặc định của đúng nguồn đó', () =>
    expect(parseNote(fixedRange([hi('zlp', 'hai mươi')])).cutoffDays.zlp).toBe(28));

  it('số lẻ → mặc định của đúng nguồn đó', () =>
    expect(parseNote(fixedRange([hi('cc', 7.5)])).cutoffDays.cc).toBe(7));

  it('0 nằm ngoài khoảng 1–28 → mặc định của đúng nguồn đó', () =>
    expect(parseNote(fixedRange([hi('cc', 0)])).cutoffDays.cc).toBe(7));

  it('29 nằm ngoài khoảng vì không phải tháng nào cũng có → mặc định của nguồn đó', () =>
    expect(parseNote(fixedRange([hi('spl', 29)])).cutoffDays.spl).toBe(24));

  it('nguồn thiếu hẳn khỏi khối → dùng mặc định của nguồn đó', () =>
    expect(parseNote(fixedRange([hi('cc', 20)])).cutoffDays)
      .toEqual({ cc: 20, spl: 24, zlp: 28 }));

  it('khối trống hoàn toàn → cả ba nguồn dùng mặc định của chính nó', () =>
    expect(parseNote(fixedRange([])).cutoffDays).toEqual({ cc: 7, spl: 24, zlp: 28 }));

  it('mảng rỗng → cả ba nguồn dùng mặc định', () =>
    expect(parseNote({ address: 'Note!A1:K6', values: [] }).cutoffDays)
      .toEqual({ cc: 7, spl: 24, zlp: 28 }));
});
