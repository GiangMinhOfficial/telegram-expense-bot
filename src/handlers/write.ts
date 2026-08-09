import { CATEGORIES, sheetName, tableName } from '../config';
import { logWrite, setLastWrite } from '../db';
import type { Env } from '../env';
import { computeTotals } from '../graph/totals';
import { appendRow, fixDateFormat, readSheet } from '../graph/workbook';
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

  const values: [string, number, number] = [e.description, serial, e.amount];
  const index = await appendRow(env, table, values);

  // Vá định dạng và hai lệnh ghi D1 chạy song song với lệnh đọc sheet: chúng
  // không đụng tới `values` nên không ảnh hưởng kết quả đọc.
  const [data] = await Promise.all([
    readSheet(env, sheet),
    fixDateFormat(env, table, index),
    setLastWrite(env.DB, chatId, {
      sheet, tableName: table, rowIndex: index,
      valuesJson: JSON.stringify(values),
    }),
    logWrite(env.DB, {
      tableName: table, rowIndex: index,
      description: e.description, amount: e.amount, dateSerial: serial,
    }),
  ]);

  const label = CATEGORIES[e.category].label;
  // Tổng theo ngày CỦA KHOẢN VỪA GHI, không phải hôm nay — để con số hiện ra
  // luôn chứa khoản vừa ghi, kể cả khi ghi lùi ngày.
  const totals = computeTotals(data, label, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(env, chatId, confirmation({ ...e, label }, totals, isToday));
}
