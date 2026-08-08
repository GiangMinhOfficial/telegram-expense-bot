import { CATEGORIES, sheetName } from '../config';
import type { Env } from '../env';
import { readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import { sendMessage } from '../telegram/api';
import { alignedRows, formatVND } from '../telegram/format';

const SPEND_BLOCKS = [0, 4] as const;
const LABEL_COL = 12;
const VALUE_COL = 13;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export async function handleToday(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const serial = toExcelSerial(today);
  const data = await readSheet(env, sheetName(today.m));

  const items: [string, string][] = [];
  let total = 0;
  for (const row of data.values) {
    for (const c of SPEND_BLOCKS) {
      const cell = row[c];
      const desc = typeof cell === 'string' ? cell.trim() : '';
      const d = num(row[c + 1]);
      const amt = num(row[c + 2]);
      if (d === serial && amt !== null && desc) {
        items.push([desc.slice(0, 22), formatVND(amt)]);
        total += amt;
      }
    }
  }

  const dm = `${String(today.d).padStart(2, '0')}/${String(today.m).padStart(2, '0')}`;
  await sendMessage(
    env, chatId,
    `<b>Hôm nay ${dm}</b>\n<pre>${alignedRows(items)}</pre>\n<b>Tổng: ${formatVND(total)}</b>`,
  );
}

export async function handleMonth(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const data = await readSheet(env, sheetName(today.m));

  const wanted = new Set<string>(Object.values(CATEGORIES).map((c) => c.label));
  const rows: [string, string][] = [];
  let spend = 0;
  let income = 0;

  for (const row of data.values) {
    const raw = row[LABEL_COL];
    const label = typeof raw === 'string' ? raw.trim() : '';
    const v = num(row[VALUE_COL]);
    if (!label || v === null) continue;
    if (label === 'Tổng chi') { spend = v; continue; }
    if (label === CATEGORIES.income.label) { income = v; continue; }
    if (wanted.has(label)) rows.push([label, formatVND(v)]);
  }

  await sendMessage(
    env, chatId,
    `<b>Tháng ${today.m}</b>\n<pre>${alignedRows(rows)}</pre>\n` +
    `<b>Tổng chi: ${formatVND(spend)}</b>\nThu nhập: ${formatVND(income)}`,
  );
}
