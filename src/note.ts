import type { Env } from './env';
import { type SheetData, cellAt, colOffset } from './graph/sheet';
import { readRange } from './graph/workbook';

export interface NoteConfig {
  /** Mã viết tắt → tên đầy đủ. Nguồn: cột E–F của sheet Note */
  shortcodes: Record<string, string>;
  /** Ngày chốt sao kê thẻ. Nguồn: ô Note!B1 */
  cutoffDay: number;
}

export const DEFAULT_CUTOFF_DAY = 7;

/** Note là sheet cấu hình, không dài ra — vùng cố định là đủ và giữ chỉ số ổn định. */
const NOTE_RANGE = 'A1:Z50';

/** Chỉ số cột TUYỆT ĐỐI. */
const CUTOFF_COL = 1; // B
const CODE_COL = 4;   // E
const FULL_COL = 5;   // F

/**
 * Tách cấu hình từ sheet Note.
 *
 * Bảng mã viết tắt quét theo cột nên đọc được ở bất kỳ vùng nào. Mốc chốt nằm ở
 * ô B1 nên chỉ tìm thấy khi vùng bắt đầu từ dòng 1 — `loadNote` luôn truyền vùng
 * cố định A1 nên điều kiện đó luôn đúng; vùng khác thì lặng lẽ dùng mặc định.
 */
export function parseNote(sheet: SheetData): NoteConfig {
  const off = colOffset(sheet.address);

  const shortcodes: Record<string, string> = {};
  for (const row of sheet.values) {
    const code = cellAt(row, CODE_COL, off);
    const full = cellAt(row, FULL_COL, off);
    if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
      shortcodes[code.trim().toUpperCase()] = full.trim();
    }
  }

  return { shortcodes, cutoffDay: readCutoff(sheet, off) };
}

function readCutoff(sheet: SheetData, off: number): number {
  const firstRow = sheet.values[0];
  if (!firstRow) return DEFAULT_CUTOFF_DAY;

  const raw = cellAt(firstRow, CUTOFF_COL, off);
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);

  // Ngoài 1–28 là vô nghĩa: mốc 29–31 không tồn tại ở mọi tháng.
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : DEFAULT_CUTOFF_DAY;
}

/**
 * Cache ở phạm vi module. Isolate của Worker sống qua nhiều request nên phần lớn
 * tin nhắn dùng lại được — bảng mã viết tắt và mốc chốt về cùng một lệnh gọi.
 */
let cache: { at: number; data: NoteConfig } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadNote(env: Env): Promise<NoteConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const data = parseNote(await readRange(env, 'Note', NOTE_RANGE));
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // Không đọc được thì vẫn phải ghi được chi tiêu: bỏ bung mã, dùng mốc mặc định.
    return cache?.data ?? { shortcodes: {}, cutoffDay: DEFAULT_CUTOFF_DAY };
  }
}
