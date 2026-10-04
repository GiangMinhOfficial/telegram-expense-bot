import { CATEGORIES, sheetName, tableName } from '../config';
import { logWrite, setLastWrite } from '../db';
import type { Env } from '../env';
import type { RowValues } from '../graph/sheet';
import { computeTotals, sumDay } from '../graph/totals';
import { appendRow, fixDateFormat, readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import type { ParsedEntry } from '../parse/message';
import { sendMessage } from '../telegram/api';
import { confirmation } from '../telegram/format';
import { tidyTable } from './tidy';

export type ExactEntry = Omit<ParsedEntry, 'amount'> & {
  amount: number;
  /** Tháng tiền rời tài khoản — khác tháng phát sinh khi quẹt thẻ sau mốc chốt. */
  targetMonth: number;
};

/**
 * Ba ô sẽ ghi vào Excel. Hàm thuần — không cần Env hay Graph để gọi.
 *
 * CHỖ DUY NHẤT ghép tiền tố nguồn (`[cc] `, `[spl] `, `[zlp] `) vào mô tả —
 * xem docs/adr/0001-tien-to-nguon-trong-cot-mo-ta.md.
 */
export function buildRow(e: ExactEntry): RowValues {
  const description = e.source ? `[${e.source}] ${e.description}` : e.description;
  return [description, toExcelSerial(e.date), e.amount];
}

export async function performWrite(
  env: Env, chatId: number, e: ExactEntry,
): Promise<void> {
  const table = tableName(e.category, e.targetMonth);
  const sheet = sheetName(e.targetMonth);
  // Bản ghi vào Excel và bản lưu để /undo đối chiếu PHẢI là cùng một mảng — dựng
  // hai lần thì một chỗ đổi mà quên chỗ kia sẽ khiến /undo xoá nhầm dòng.
  const values = buildRow(e);
  const [description, serial] = values;

  const index = await appendRow(env, table, values);

  // Khoản trả sau nhảy tháng: chi tiền mặt cùng ngày nằm ở sheet tháng phát sinh,
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
      description, amount: e.amount, dateSerial: serial,
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

  // Dọn SAU tin xác nhận và không bao giờ ném ra ngoài: ném ra là khoản bị đẩy vào hàng
  // đợi ghi lại và ghi trùng dù nó đã nằm trong Excel.
  await tidyTable(env, chatId, table);
}
