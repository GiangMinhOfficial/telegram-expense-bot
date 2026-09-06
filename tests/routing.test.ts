import { describe, expect, it } from 'vitest';
import { paymentMonth } from '../src/billing';
import { tableName } from '../src/config';
import { buildRow, type ExactEntry } from '../src/handlers/write';
import { parseMessage } from '../src/parse/message';

/**
 * Nối cả chuỗi quyết định lại: chữ người dùng gõ → bảng Excel nhận dòng.
 *
 * Từng mắt xích đã có test riêng, nhưng chỗ chúng ghép vào nhau thì chưa —
 * mà đó mới là lời hứa của tính năng. Cả chuỗi đều là hàm thuần nên kiểm được
 * mà không cần dựng Env hay giả lập Graph.
 */
const NOW = Date.UTC(2026, 7, 10, 5, 0); // 12:00 ngày 10/08/2026 giờ VN

interface Destination { table: string; description: string }

// Ô mô tả đọc qua `buildRow` — tức chính hàm hàng ghi thật gọi — chứ không đọc
// thẳng `parsed.entry.description`, để ticket 02 ghép tiền tố ở đó thì seam
// này bắt được thay đổi thay vì chỉ quan sát mỗi bước phân tích.
const destination = (text: string, cutoffDay = 7): Destination => {
  const parsed = parseMessage(text, NOW, {});
  if (!parsed.ok) throw new Error(`không phân tích được: ${parsed.error}`);
  if (parsed.entry.amount.kind !== 'exact') throw new Error('seam này không xử lý số tiền mơ hồ');
  const target = paymentMonth(parsed.entry.date, parsed.entry.source, cutoffDay);
  if (!target.ok) throw new Error(`bị từ chối: ${target.error}`);

  const exact: ExactEntry = {
    ...parsed.entry, amount: parsed.entry.amount.amount, targetMonth: target.month,
  };
  const [description] = buildRow(exact);
  return { table: tableName(parsed.entry.category, target.month), description };
};

describe('từ tin nhắn tới bảng đích', () => {
  it('tiền mặt ngày 10/8 → bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k')).toEqual({ table: 'food_8', description: 'ăn trưa' }));

  it('quẹt thẻ ngày 10/8 → bảng tháng 9', () =>
    expect(destination('/food ăn trưa 40k cc')).toEqual({ table: 'food_9', description: 'ăn trưa' }));

  it('quẹt thẻ ngày 3/8 chưa qua mốc → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 3/8 cc')).toEqual({ table: 'food_8', description: 'ăn trưa' }));

  it('quẹt thẻ đúng ngày mốc 7/8 → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 7/8 cc')).toEqual({ table: 'food_8', description: 'ăn trưa' }));

  it('ghi lùi sang tháng trước: quẹt thẻ 10/7 → bảng tháng 8', () =>
    // Ngày 10/7 đã qua mốc của kỳ sao kê 7/7, nên rơi vào kỳ 7/8 và trả trong
    // tháng 8. Ghi lùi ngày và quy tắc thẻ tự khớp, không cần luật riêng.
    expect(destination('/food ăn trưa 40k 10/7 cc')).toEqual({ table: 'food_8', description: 'ăn trưa' }));

  it('mốc chốt 4 đẩy ngày 5/8 sang bảng tháng 9', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 4)).toEqual({ table: 'food_9', description: 'ăn trưa' }));

  it('cùng ngày 5/8 với mốc 7 thì ở lại bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 7)).toEqual({ table: 'food_8', description: 'ăn trưa' }));

  it('nhóm khác cũng đi theo cùng quy tắc', () =>
    expect(destination('/transport grab 55k cc')).toEqual({ table: 'transport_9', description: 'grab' }));

  it('tiền mặt không bao giờ nhảy tháng, kể cả cuối tháng', () =>
    expect(destination('/other lặt vặt 30k 28/8')).toEqual({ table: 'other_8', description: 'lặt vặt' }));

  it('ô mô tả đúng bằng chữ người dùng gõ, không mang tiền tố nguồn', () =>
    expect(destination('/food ăn trưa 40k cc').description).toBe('ăn trưa'));
});

describe('khoản thẻ vắt sang năm sau bị chặn ngay ở chuỗi này', () => {
  it('quẹt thẻ 10/12 → từ chối, không có bảng nào nhận', () =>
    expect(() => destination('/food ăn trưa 40k 10/12 cc')).toThrow(/1\/2027/));

  it('tiền mặt 10/12 vẫn ghi bình thường', () =>
    expect(destination('/food ăn trưa 40k 10/12')).toEqual({ table: 'food_12', description: 'ăn trưa' }));
});
