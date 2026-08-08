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

export const sheetName = (month: number) => `Tháng ${month}`;
export const tableName = (cat: CategoryKey, month: number) =>
  `${CATEGORIES[cat].table}_${month}`;
