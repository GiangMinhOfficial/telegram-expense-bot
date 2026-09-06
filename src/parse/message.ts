import { type CategoryKey, WORKBOOK_YEAR, isCategory } from '../config';
import { type Amount, parseAmount } from './amount';
import { type VNDate, parseDateToken, vnToday } from './date';

/**
 * Nguồn trả sau — quyết định tháng đích, xem src/billing.ts.
 * `null` nghĩa là tiền rời tài khoản ngay (xem CONTEXT.md, mục "Nguồn trả sau").
 */
export type DeferredSource = 'cc';

export interface ParsedEntry {
  category: CategoryKey;
  description: string;
  date: VNDate;
  amount: Amount;
  source: DeferredSource | null;
}

/**
 * Đọc `source` từ một bản ghi JSON có thể thuộc kiểu cũ — trước ticket 01
 * (prefactor) mang `isCard: boolean` thay vì `source`. Dùng ở hàng đợi ghi lại
 * và khoản mơ hồ đang chờ. Xoá được sau khi deploy xong và hàng đợi ghi lại đã rỗng.
 */
export function legacySource(p: { source?: DeferredSource | null; isCard?: boolean }):
DeferredSource | null {
  return p.source ?? (p.isCard ? 'cc' : null);
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

/**
 * Chỉ nhận đúng `cc`, KHÔNG nhận `thẻ`/`the`/`td`.
 *
 * "/other nạp thẻ 100k" là câu hoàn toàn bình thường để ghi nạp thẻ điện thoại.
 * Nếu "thẻ" là từ khoá thì khoản đó bị đẩy sang tháng sau mà không có dấu hiệu
 * nào báo. `cc` không đụng từ tiếng Việt nào.
 */
const CARD_TOKEN = 'cc';

/** Thu nhập, đầu tư, tiết kiệm không phải khoản quẹt thẻ. */
const CARD_ALLOWED = new Set<CategoryKey>([
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

  // Bóc token cc ra trước khi quét số tiền, ngày, mô tả.
  const tokens: string[] = [];
  let source: DeferredSource | null = null;
  for (const t of raws) {
    if (t.toLowerCase() === CARD_TOKEN) { source = 'cc'; continue; }
    tokens.push(t);
  }

  if (source && !CARD_ALLOWED.has(cmd)) {
    return {
      ok: false,
      error: `cc chỉ dùng cho các nhóm chi tiêu, không dùng với /${cmd}.`,
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
