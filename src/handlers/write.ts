import { CATEGORIES, sheetName, tableName } from '../config';
import { logWrite, setLastWrite } from '../db';
import type { Env } from '../env';
import { computeTotals } from '../graph/totals';
import { addRow, readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import type { ParsedEntry } from '../parse/message';
import { sendMessage } from '../telegram/api';
import { confirmation } from '../telegram/format';

export type ExactEntry = Omit<ParsedEntry, 'amount'> & { amount: number };

export async function performWrite(
  env: Env, chatId: number, e: ExactEntry,
): Promise<void> {
  const table = tableName(e.category, e.date.m);
  const sheet = sheetName(e.date.m);
  const serial = toExcelSerial(e.date);

  const index = await addRow(env, table, [e.description, serial, e.amount]);

  await setLastWrite(env.DB, chatId, {
    sheet, tableName: table, rowIndex: index,
    valuesJson: JSON.stringify([e.description, serial, e.amount]),
  });
  await logWrite(env.DB, {
    tableName: table, rowIndex: index,
    description: e.description, amount: e.amount, dateSerial: serial,
  });

  const label = CATEGORIES[e.category].label;
  const data = await readSheet(env, sheet);
  // Tổng theo ngày CỦA KHOẢN VỪA GHI, không phải hôm nay — để con số hiện ra
  // luôn chứa khoản vừa ghi, kể cả khi ghi lùi ngày.
  const totals = computeTotals(data, label, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(env, chatId, confirmation({ ...e, label }, totals, isToday));
}
