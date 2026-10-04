export const WORKBOOK_YEAR = 2026;
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 9 lệnh ghi. Khoá = lệnh (không có dấu /). Nguồn: sheet Note cột J–K. */
export const CATEGORIES = {
  food:          { table: 'food',          label: 'Ăn uống sinh hoạt' },
  eat_out:       { table: 'eat_out',       label: 'Ăn ngoài' },
  transport:     { table: 'transport',     label: 'Phương tiện di chuyển' },
  force:         { table: 'force',         label: 'Chi tiêu bắt buộc' },
  other:         { table: 'other',         label: 'Linh tinh' },
  other_expense: { table: 'other_expense', label: 'Chi tiêu khác' },
  income:        { table: 'income',        label: 'Thu nhập' },
  invest:        { table: 'invest',        label: 'Đầu tư' },
  saving:        { table: 'saving',        label: 'Tiết kiệm' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const isCategory = (s: string): s is CategoryKey =>
  Object.prototype.hasOwnProperty.call(CATEGORIES, s);

/**
 * Tập đóng nguồn trả sau. Khoá = token gõ trong tin nhắn, cũng là tiền tố ghép
 * vào ô mô tả khi ghi (xem `buildRow` ở src/handlers/write.ts).
 *
 * `defaultCutoffDay` là mặc định khai báo trong code, dùng khi sheet `Note`
 * không có mốc riêng cho nguồn đó (xem `note.ts`, khối `H`–`I`).
 */
export const DEFERRED_SOURCES = {
  hsbc: { label: 'Thẻ HSBC',           emoji: '💳', defaultCutoffDay: 7 },
  vpb:  { label: 'Thẻ VPBank',         emoji: '🟢', defaultCutoffDay: 26 },
  spl:  { label: 'SPayLater',          emoji: '🛍️', defaultCutoffDay: 24 },
  zlp:  { label: 'Ví trả sau ZaloPay', emoji: '🔵', defaultCutoffDay: 28 },
} as const;

/**
 * Tiền tố `[cc] ` của các dòng ghi TRƯỚC khi thẻ HSBC đổi token từ `cc` sang
 * `hsbc`. Các dòng đó nằm nguyên trong file, không backfill; `cc` giờ không còn
 * là token — gõ vào tin nhắn thì nó là chữ thường trong mô tả.
 */
export const LEGACY_HSBC_TOKEN = 'cc';

/**
 * `null` (không phải thành viên của kiểu này) nghĩa là tiền rời tài khoản
 * ngay — xem CONTEXT.md, mục "Nguồn trả sau".
 */
export type DeferredSource = keyof typeof DEFERRED_SOURCES;

export const isDeferredSource = (s: string): s is DeferredSource =>
  Object.prototype.hasOwnProperty.call(DEFERRED_SOURCES, s);

/** Mốc chốt mặc định của mọi nguồn, khai báo trong code. */
export const defaultCutoffDays = (): Record<DeferredSource, number> =>
  Object.fromEntries(
    Object.entries(DEFERRED_SOURCES).map(([k, v]) => [k, v.defaultCutoffDay]),
  ) as Record<DeferredSource, number>;

/**
 * Mốc chốt của một nguồn, tra trong `cutoffDays` (mặc định: mặc định khai báo
 * trong code — `loadNote` trả về bản đã áp mốc từ sheet `Note` khi có). `0`
 * khi không có nguồn — giá trị không có ý nghĩa riêng, `paymentMonth`
 * (src/billing.ts) bỏ qua cutoff khi `source` là `null` nên số nào cũng cho
 * cùng kết quả.
 */
export const cutoffDayFor = (
  source: DeferredSource | null,
  cutoffDays: Record<DeferredSource, number> = defaultCutoffDays(),
): number => (source ? cutoffDays[source] : 0);

export const sheetName = (month: number) => `Tháng ${month}`;
export const tableName = (cat: CategoryKey, month: number) =>
  `${CATEGORIES[cat].table}_${month}`;
