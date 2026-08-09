import { CATEGORIES, sheetName, tableName } from '../config';
import { logWrite, setLastWrite } from '../db';
import type { Env } from '../env';
import { computeTotals, sumDay } from '../graph/totals';
import { appendRow, fixDateFormat, readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import type { ParsedEntry } from '../parse/message';
import { sendMessage } from '../telegram/api';
import { confirmation } from '../telegram/format';

export type ExactEntry = Omit<ParsedEntry, 'amount'> & {
  amount: number;
  /** Tháng tiền rời tài khoản — khác tháng phát sinh khi quẹt thẻ sau mốc chốt. */
  targetMonth: number;
};

export async function performWrite(
  env: Env, chatId: number, e: ExactEntry,
): Promise<void> {
  const table = tableName(e.category, e.targetMonth);
  const sheet = sheetName(e.targetMonth);
  const serial = toExcelSerial(e.date);
  const values: [string, number, number] = [e.description, serial, e.amount];

  const index = await appendRow(env, table, values);

  // Khoản thẻ nhảy tháng: chi tiền mặt cùng ngày nằm ở sheet tháng phát sinh,
  // khoản vừa ghi nằm ở sheet tháng thanh toán — phải cộng cả hai.
  const crossed = e.targetMonth !== e.date.m;

  // Vá định dạng và ghi D1 chạy song song với hai lệnh đọc: chúng không đụng tới
  // `values` nên không ảnh hưởng kết quả đọc, mà lại tiết kiệm được thời gian chờ.
  const [dest, origin] = await Promise.all([
    readSheet(env, sheet),
    crossed ? readSheet(env, sheetName(e.date.m)) : Promise.resolve(null),
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
  const totals = computeTotals(dest, label, serial);
  if (origin) totals.today += sumDay(origin, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(env, chatId, confirmation({ ...e, label }, totals, isToday));
}
