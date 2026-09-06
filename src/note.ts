import { DEFERRED_SOURCES, type DeferredSource, isDeferredSource } from './config';
import type { Env } from './env';
import { type SheetData, cellAt, colOffset } from './graph/sheet';
import { readRange } from './graph/workbook';

export interface NoteConfig {
  /** Mã viết tắt → tên đầy đủ. Nguồn: cột E–F của sheet Note */
  shortcodes: Record<string, string>;
  /** Mốc chốt sao kê của cả ba nguồn. Nguồn: khối H (token) – I (ngày chốt) của sheet Note */
  cutoffDays: Record<DeferredSource, number>;
}

/** Note là sheet cấu hình, không dài ra — vùng cố định là đủ và giữ chỉ số ổn định. */
const NOTE_RANGE = 'A1:Z50';

/** Chỉ số cột TUYỆT ĐỐI. */
const CODE_COL = 4;   // E
const FULL_COL = 5;   // F
const SOURCE_COL = 7; // H
const CUTOFF_COL = 8; // I

function defaultCutoffDays(): Record<DeferredSource, number> {
  return Object.fromEntries(
    Object.entries(DEFERRED_SOURCES).map(([k, v]) => [k, v.defaultCutoffDay]),
  ) as Record<DeferredSource, number>;
}

/**
 * Tách cấu hình từ sheet Note. Cả bảng mã viết tắt lẫn khối H–I đều quét theo
 * cột nên đọc được ở bất kỳ vùng nào — xem `colOffset`.
 */
export function parseNote(sheet: SheetData): NoteConfig {
  const off = colOffset(sheet.address);

  const shortcodes: Record<string, string> = {};
  const cutoffDays = defaultCutoffDays();

  for (const row of sheet.values) {
    const code = cellAt(row, CODE_COL, off);
    const full = cellAt(row, FULL_COL, off);
    if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
      shortcodes[code.trim().toUpperCase()] = full.trim();
    }

    const token = cellAt(row, SOURCE_COL, off);
    if (typeof token !== 'string') continue;
    const source = token.trim().toLowerCase();
    if (!isDeferredSource(source)) continue; // token lạ ở cột H → bỏ qua

    const raw = cellAt(row, CUTOFF_COL, off);
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    // Ngoài 1–28 là vô nghĩa: mốc 29–31 không tồn tại ở mọi tháng.
    if (Number.isInteger(n) && n >= 1 && n <= 28) cutoffDays[source] = n;
  }

  return { shortcodes, cutoffDays };
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
    return cache?.data ?? { shortcodes: {}, cutoffDays: defaultCutoffDays() };
  }
}
