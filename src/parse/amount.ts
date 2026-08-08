export type Amount =
  | { kind: 'exact'; amount: number }
  | { kind: 'ambiguous'; low: number; high: number };

/** số  +  đơn vị tuỳ chọn  +  chữ số đuôi tuỳ chọn (1tr5)  +  hậu tố tiền tệ tuỳ chọn */
const RE = /^(\d+(?:[.,]\d+)*)(k|n|tr|m)?(\d)?(?:đ|d|vnd)?$/i;
/** nhóm nghìn hợp lệ: 40.000 · 3.000.000 — nhưng không phải 1.5 hay 12.34.56 */
const GROUPED = /^\d{1,3}(?:[.,]\d{3})+$/;

export function parseAmount(token: string): Amount | null {
  const m = RE.exec(token.trim());
  if (!m) return null;
  const [, numStr, unitRaw, tail] = m;
  if (numStr === undefined) return null;

  if (unitRaw) {
    // Có đơn vị → dấu chấm/phẩy là dấu THẬP PHÂN.
    const mult = /k|n/i.test(unitRaw) ? 1_000 : 1_000_000;
    const base = Number.parseFloat(numStr.replace(',', '.'));
    if (!Number.isFinite(base)) return null;
    const extra = tail ? Number.parseInt(tail, 10) * (mult / 10) : 0;
    const amount = Math.round(base * mult + extra);
    return amount > 0 ? { kind: 'exact', amount } : null;
  }

  if (tail) return null; // "40 5" không có nghĩa khi thiếu đơn vị

  if (/[.,]/.test(numStr)) {
    // Không đơn vị nhưng có dấu → chỉ chấp nhận nhóm nghìn hợp lệ.
    if (!GROUPED.test(numStr)) return null;
    const amount = Number.parseInt(numStr.replace(/[.,]/g, ''), 10);
    return amount > 0 ? { kind: 'exact', amount } : null;
  }

  // SỐ TRẦN — quy tắc ba vùng (spec mục 4.3).
  const n = Number.parseInt(numStr, 10);
  if (!(n > 0)) return null;
  if (n <= 999) return { kind: 'exact', amount: n * 1_000 };
  if (n <= 9_999) return { kind: 'ambiguous', low: n, high: n * 1_000 };
  return { kind: 'exact', amount: n };
}
