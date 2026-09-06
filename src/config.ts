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
 * `defaultCutoffDay` là mặc định khai báo trong code; đọc mốc từ sheet `Note`
 * là việc của ticket 03 (xem .scratch/nguon-tra-sau/issues/03-*.md).
 */
export const DEFERRED_SOURCES = {
  cc:  { label: 'Thẻ tín dụng',       emoji: '💳', defaultCutoffDay: 7 },
  spl: { label: 'SPayLater',          emoji: '🛍️', defaultCutoffDay: 24 },
  zlp: { label: 'Ví trả sau ZaloPay', emoji: '🔵', defaultCutoffDay: 28 },
} as const;

/**
 * `null` (không phải thành viên của kiểu này) nghĩa là tiền rời tài khoản
 * ngay — xem CONTEXT.md, mục "Nguồn trả sau".
 */
export type DeferredSource = keyof typeof DEFERRED_SOURCES;

export const isDeferredSource = (s: string): s is DeferredSource =>
  Object.prototype.hasOwnProperty.call(DEFERRED_SOURCES, s);

/**
 * Mốc chốt mặc định của một nguồn. `0` khi không có nguồn — giá trị không có
 * ý nghĩa riêng, `paymentMonth` (src/billing.ts) bỏ qua cutoff khi `source` là
 * `null` nên số nào cũng cho cùng kết quả.
 */
export const cutoffDayFor = (source: DeferredSource | null): number =>
  source ? DEFERRED_SOURCES[source].defaultCutoffDay : 0;

export const sheetName = (month: number) => `Tháng ${month}`;
export const tableName = (cat: CategoryKey, month: number) =>
  `${CATEGORIES[cat].table}_${month}`;
