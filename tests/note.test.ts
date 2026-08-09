import { describe, expect, it } from 'vitest';
import { DEFAULT_CUTOFF_DAY, parseNote } from '../src/note';

/** Đúng hình dạng usedRange thật của sheet Note: bắt đầu ở E4, 7 cột E..K. */
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

/** Vùng cố định A1:H6 — cái mà loadNote thật sự đọc. Cột A..H = chỉ số 0..7. */
const fixedRange = (b1: unknown) => ({
  address: 'Note!A1:H6',
  values: [
    ['Ngày chốt sao kê thẻ', b1, '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', 'WM', 'Winmart', '', ''],
    ['', '', '', '', 'TC', 'TocoToco', '', ''],
    ['', '', '', '', 'VM', 'V-mart', '', ''],
  ],
});

describe('bảng mã viết tắt', () => {
  it('HỒI QUY: vùng bắt đầu từ E4 vẫn đọc được mã — lỗi này đã lên production', () => {
    expect(parseNote(usedRangeShape).shortcodes).toEqual({
      WM: 'Winmart', TC: 'TocoToco', MT: 'Mầm Trà', VM: 'V-mart',
    });
  });

  it('vùng cố định bắt đầu từ A1 cũng đọc được', () =>
    expect(parseNote(fixedRange(7)).shortcodes).toEqual({
      WM: 'Winmart', TC: 'TocoToco', VM: 'V-mart',
    }));

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

describe('mốc chốt sao kê', () => {
  it('đọc số từ ô B1', () =>
    expect(parseNote(fixedRange(4)).cutoffDay).toBe(4));

  it('chuỗi số cũng nhận', () =>
    expect(parseNote(fixedRange('4')).cutoffDay).toBe(4));

  it('ô trống → mặc định 7', () =>
    expect(parseNote(fixedRange('')).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('không phải số → mặc định 7', () =>
    expect(parseNote(fixedRange('bảy')).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('0 nằm ngoài khoảng → mặc định 7', () =>
    expect(parseNote(fixedRange(0)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('29 nằm ngoài khoảng vì không phải tháng nào cũng có → mặc định 7', () =>
    expect(parseNote(fixedRange(29)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('số lẻ → mặc định 7', () =>
    expect(parseNote(fixedRange(7.5)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('vùng không chứa ô B1 → mặc định 7, không được đọc nhầm ô khác', () =>
    expect(parseNote(usedRangeShape).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('mảng rỗng → mặc định 7', () =>
    expect(parseNote({ address: 'Note!A1:H6', values: [] }).cutoffDay)
      .toBe(DEFAULT_CUTOFF_DAY));
});
