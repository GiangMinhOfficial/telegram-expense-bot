import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/parse/amount';

const exact = (n: number) => ({ kind: 'exact', amount: n });

describe('có hậu tố đơn vị', () => {
  it.each([
    ['40k', 40_000], ['40K', 40_000], ['40n', 40_000], ['40N', 40_000],
    ['1tr', 1_000_000], ['1TR', 1_000_000], ['1m', 1_000_000], ['1M', 1_000_000],
    ['1tr5', 1_500_000], ['1tr2', 1_200_000],
    ['1.5tr', 1_500_000], ['1,5tr', 1_500_000],
    ['40k5', 40_500],
  ])('%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('có dấu phân cách nghìn — luôn tường minh', () => {
  it.each([
    ['40.000', 40_000], ['40,000', 40_000],
    ['1.500', 1_500], ['3.000.000', 3_000_000],
  ])('%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('số trần', () => {
  it.each([['40', 40_000], ['500', 500_000], ['999', 999_000]])(
    '%s ≤999 → nhân 1000 → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));

  it.each([['1000', 1_000, 1_000_000], ['1500', 1_500, 1_500_000], ['9999', 9_999, 9_999_000]])(
    '%s trong 1000–9999 → mơ hồ', (tok, low, high) =>
      expect(parseAmount(tok)).toEqual({ kind: 'ambiguous', low, high }));

  it.each([['10000', 10_000], ['40000', 40_000], ['3000000', 3_000_000]])(
    '%s ≥10000 → giữ nguyên → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('hậu tố tiền tệ được bỏ qua', () => {
  it.each([['40000đ', 40_000], ['40000d', 40_000], ['40000vnd', 40_000], ['40kđ', 40_000]])(
    '%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('không phải số tiền', () => {
  it.each(['cơm', 'trưa', '', 'hqua', '5/8', 'abc123', '1.5', '12.34.56', '0', '0k'])(
    '%s → null', (tok) => expect(parseAmount(tok)).toBeNull());
});
