import { VN_OFFSET_MS } from '../config';

export interface VNDate { y: number; m: number; d: number }

/** Mốc serial của Excel là 1899-12-30. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function vnToday(nowMs: number): VNDate {
  const t = new Date(nowMs + VN_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function toExcelSerial({ y, m, d }: VNDate): number {
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_MS) / 86_400_000);
}

function shiftDays(base: VNDate, delta: number): VNDate {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d) + delta * 86_400_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Dấu thanh tiếng Việt sau khi normalize('NFD') là các ký tự tổ hợp U+0300–U+036F.
 * Dựng regex từ chuỗi thay vì viết literal — literal sẽ là ký tự vô hình trong source.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bỏ dấu tiếng Việt để "hôm" và "hom" khớp cùng một từ khoá. */
const deaccent = (s: string) =>
  s.normalize('NFD').replace(COMBINING_MARKS, '').replace(/đ/gi, 'd').toLowerCase();

const KEYWORDS: Record<string, number> = {
  hnay: 0, homnay: 0, today: 0,
  hqua: -1, hq: -1, homqua: -1,
  hkia: -2, homkia: -2,
};

const NUMERIC = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/;

export function parseDateToken(token: string, today: VNDate): VNDate | null {
  const t = deaccent(token.trim());
  if (!t) return null;

  const delta = KEYWORDS[t];
  if (delta !== undefined) return shiftDays(today, delta);

  const m = NUMERIC.exec(t);
  if (!m) return null;
  const d = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10);
  let y = today.y;
  if (m[3]) {
    const raw = Number.parseInt(m[3], 10);
    y = m[3].length === 2 ? 2000 + raw : raw;
  }
  if (mo < 1 || mo > 12 || d < 1) return null;
  // Chặn ngày không tồn tại: 31/2 phải trả null, không được cuộn sang 3/3.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
