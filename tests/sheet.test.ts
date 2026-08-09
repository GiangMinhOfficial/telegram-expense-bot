import { describe, expect, it } from 'vitest';
import { cellAt, colOffset, num, text } from '../src/graph/sheet';

describe('colOffset', () => {
  it('vùng bắt đầu từ A1 → 0', () =>
    expect(colOffset('Tháng 8!A1:O39')).toBe(0));

  it('vùng bắt đầu từ E4 → 4 — đây chính là hình dạng thật của sheet Note', () =>
    expect(colOffset('Note!E4:K12')).toBe(4));

  it('cột hai chữ cái', () =>
    expect(colOffset('Sheet1!AA1:AB2')).toBe(26));

  it('tên sheet có dấu nháy', () =>
    expect(colOffset("'Tháng 8'!E4:K12")).toBe(4));

  it('địa chỉ không có dấu chấm than → 0, không được ném lỗi', () =>
    expect(colOffset('hong')).toBe(0));
});

describe('cellAt', () => {
  const row = ['WM', 'Winmart', '', '', '', '/food', 'Ăn uống sinh hoạt'];

  it('bù trừ đúng: cột E của vùng bắt đầu từ E', () =>
    expect(cellAt(row, 4, 4)).toBe('WM'));

  it('bù trừ đúng: cột F của vùng bắt đầu từ E', () =>
    expect(cellAt(row, 5, 4)).toBe('Winmart'));

  it('không bù trừ: cột 0 của vùng bắt đầu từ A', () =>
    expect(cellAt(row, 0, 0)).toBe('WM'));

  it('cột nằm trước vùng đã đọc → undefined, không được trả nhầm ô khác', () =>
    expect(cellAt(row, 1, 4)).toBeUndefined());
});

describe('num và text', () => {
  it('num nhận số hữu hạn', () => expect(num(40_000)).toBe(40_000));
  it('num loại chuỗi', () => expect(num('40000')).toBeNull());
  it('num loại NaN', () => expect(num(Number.NaN)).toBeNull());
  it('num loại ô trống', () => expect(num(undefined)).toBeNull());
  it('text cắt khoảng trắng', () => expect(text('  Tổng chi  ')).toBe('Tổng chi'));
  it('text với số trả về chuỗi rỗng', () => expect(text(42)).toBe(''));
});
