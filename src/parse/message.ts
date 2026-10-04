import {
  type CategoryKey, type DeferredSource, LEGACY_HSBC_TOKEN, WORKBOOK_YEAR, isCategory,
  isDeferredSource,
} from '../config';
import { type Amount, parseAmount } from './amount';
import { type VNDate, parseDateToken, vnToday } from './date';

export interface ParsedEntry {
  category: CategoryKey;
  description: string;
  date: VNDate;
  amount: Amount;
  source: DeferredSource | null;
}

/**
 * Đọc `source` từ một bản ghi JSON có thể thuộc kiểu cũ: mang `isCard: boolean`
 * thay vì `source`, hoặc mang `source: 'cc'` từ trước khi thẻ HSBC đổi token.
 * Cả hai đều là thẻ HSBC. Dùng ở hàng đợi ghi lại và khoản mơ hồ đang chờ. Xoá
 * được sau khi deploy xong và hàng đợi ghi lại đã rỗng.
 */
export function legacySource(p: { source?: string | null; isCard?: boolean }):
DeferredSource | null {
  if (p.source === LEGACY_HSBC_TOKEN || (p.source == null && p.isCard)) return 'hsbc';
  return p.source != null && isDeferredSource(p.source) ? p.source : null;
}
export type ParseOutcome =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; error: string };

/** Gộp các cụm ngày hai chữ thành một token trước khi tách. */
const MULTIWORD: [RegExp, string][] = [
  [/\bh(ô|o)m\s+nay\b/giu, 'hnay'],
  [/\bh(ô|o)m\s+qua\b/giu, 'hqua'],
  [/\bh(ô|o)m\s+kia\b/giu, 'hkia'],
];

/** Thu nhập, đầu tư, tiết kiệm không đến từ nguồn trả sau. */
const DEFERRED_ALLOWED = new Set<CategoryKey>([
  'food', 'eat_out', 'transport', 'force', 'other', 'other_expense',
]);

export function parseMessage(
  text: string,
  nowMs: number,
  shortcodes: Record<string, string>,
): ParseOutcome {
  let raw = text.trim();
  if (!raw.startsWith('/')) {
    return { ok: false, error: 'Tin nhắn phải bắt đầu bằng một lệnh, ví dụ /food' };
  }

  for (const [re, to] of MULTIWORD) raw = raw.replace(re, to);

  const parts = raw.split(/\s+/);
  // "/food@my_bot" → "food"
  const cmd = parts[0]!.slice(1).split('@')[0]!.toLowerCase();
  if (!isCategory(cmd)) {
    return { ok: false, error: `Không có lệnh /${cmd}. Gõ /help để xem danh sách lệnh.` };
  }

  const raws = parts.slice(1).filter(Boolean);

  // Bóc token nguồn (đúng hsbc/vpb/spl/zlp) ra trước khi quét số tiền, ngày, mô tả.
  // KHÔNG nhận thẻ/the/td/ví: "/other nạp thẻ 100k" phải là câu bình thường.
  // `cc` cũng KHÔNG còn là token: nó ở lại trong mô tả như một chữ thường.
  const tokens: string[] = [];
  const sources = new Set<DeferredSource>();
  for (const t of raws) {
    const lower = t.toLowerCase();
    if (isDeferredSource(lower)) { sources.add(lower); continue; }
    tokens.push(t);
  }

  // Hai token KHÁC NHAU (vd. "hsbc vpb") là mơ hồ — không đoán, gõ lại lần nữa
  // vẫn tính là một nguồn duy nhất.
  if (sources.size > 1) {
    return {
      ok: false,
      error: `Chỉ được dùng một nguồn trả sau trong một tin, không được gõ cả `
        + `${[...sources].join(' lẫn ')}.`,
    };
  }
  const source = sources.size === 1 ? [...sources][0]! : null;

  if (source && !DEFERRED_ALLOWED.has(cmd)) {
    return {
      ok: false,
      error: `${source} chỉ dùng cho các nhóm chi tiêu, không dùng với /${cmd}.`,
    };
  }

  // Số tiền: token CUỐI CÙNG khớp mẫu. Quét ngược để "cơm 2 người 80k" lấy 80k.
  let amount: Amount | null = null;
  let amountAt = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const a = parseAmount(tokens[i]!);
    if (a) { amount = a; amountAt = i; break; }
  }
  if (!amount) {
    return { ok: false, error: 'Không tìm thấy số tiền. Ví dụ: /food ăn trưa 40k' };
  }

  const today = vnToday(nowMs);
  // Ngày: token ĐẦU TIÊN khớp mẫu, bỏ qua token đã nhận là số tiền.
  let date: VNDate | null = null;
  let dateAt = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (i === amountAt) continue;
    const d = parseDateToken(tokens[i]!, today);
    if (d) { date = d; dateAt = i; break; }
  }
  if (!date) date = today;

  if (date.y !== WORKBOOK_YEAR) {
    return {
      ok: false,
      error: `File chỉ ghi được năm ${WORKBOOK_YEAR}, ngày bạn nhập thuộc năm ${date.y}.`,
    };
  }

  const description = tokens
    .filter((_, i) => i !== amountAt && i !== dateAt)
    .map((w) => shortcodes[w.toUpperCase()] ?? w)
    .join(' ')
    .trim();

  if (!description) {
    return { ok: false, error: 'Thiếu mô tả. Ví dụ: /food ăn trưa 40k' };
  }

  return { ok: true, entry: { category: cmd, description, date, amount, source } };
}
