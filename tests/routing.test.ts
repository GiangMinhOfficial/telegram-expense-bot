import { describe, expect, it } from 'vitest';
import { paymentMonth } from '../src/billing';
import { tableName } from '../src/config';
import { parseMessage } from '../src/parse/message';

/**
 * Nối cả chuỗi quyết định lại: chữ người dùng gõ → bảng Excel nhận dòng.
 *
 * Từng mắt xích đã có test riêng, nhưng chỗ chúng ghép vào nhau thì chưa —
 * mà đó mới là lời hứa của tính năng. Cả chuỗi đều là hàm thuần nên kiểm được
 * mà không cần dựng Env hay giả lập Graph.
 */
const NOW = Date.UTC(2026, 7, 10, 5, 0); // 12:00 ngày 10/08/2026 giờ VN

const destination = (text: string, cutoffDay = 7): string => {
  const parsed = parseMessage(text, NOW, {});
  if (!parsed.ok) throw new Error(`không phân tích được: ${parsed.error}`);
  const target = paymentMonth(parsed.entry.date, parsed.entry.isCard, cutoffDay);
  if (!target.ok) throw new Error(`bị từ chối: ${target.error}`);
  return tableName(parsed.entry.category, target.month);
};

describe('từ tin nhắn tới bảng đích', () => {
  it('tiền mặt ngày 10/8 → bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k')).toBe('food_8'));

  it('quẹt thẻ ngày 10/8 → bảng tháng 9', () =>
    expect(destination('/food ăn trưa 40k cc')).toBe('food_9'));

  it('quẹt thẻ ngày 3/8 chưa qua mốc → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 3/8 cc')).toBe('food_8'));

  it('quẹt thẻ đúng ngày mốc 7/8 → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 7/8 cc')).toBe('food_8'));

  it('ghi lùi sang tháng trước: quẹt thẻ 10/7 → bảng tháng 8', () =>
    // Ngày 10/7 đã qua mốc của kỳ sao kê 7/7, nên rơi vào kỳ 7/8 và trả trong
    // tháng 8. Ghi lùi ngày và quy tắc thẻ tự khớp, không cần luật riêng.
    expect(destination('/food ăn trưa 40k 10/7 cc')).toBe('food_8'));

  it('mốc chốt 4 đẩy ngày 5/8 sang bảng tháng 9', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 4)).toBe('food_9'));

  it('cùng ngày 5/8 với mốc 7 thì ở lại bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 7)).toBe('food_8'));

  it('nhóm khác cũng đi theo cùng quy tắc', () =>
    expect(destination('/transport grab 55k cc')).toBe('transport_9'));

  it('tiền mặt không bao giờ nhảy tháng, kể cả cuối tháng', () =>
    expect(destination('/other lặt vặt 30k 28/8')).toBe('other_8'));
});

describe('khoản thẻ vắt sang năm sau bị chặn ngay ở chuỗi này', () => {
  it('quẹt thẻ 10/12 → từ chối, không có bảng nào nhận', () =>
    expect(() => destination('/food ăn trưa 40k 10/12 cc')).toThrow(/1\/2027/));

  it('tiền mặt 10/12 vẫn ghi bình thường', () =>
    expect(destination('/food ăn trưa 40k 10/12')).toBe('food_12'));
});
