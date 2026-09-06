import { describe, expect, it } from 'vitest';
import { paymentMonth } from '../src/billing';
import { cutoffDayFor, tableName } from '../src/config';
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
//
// `cutoffOverride` mô phỏng đúng cái router.ts thật làm: không truyền thì lấy
// mốc mặc định của nguồn đã gõ; truyền vào thì dùng để kiểm công thức tổng
// quát (mốc nào cũng ra cùng một kết quả, chỉ số khác nhau).
const destination = (text: string, cutoffOverride?: number): Destination => {
  const parsed = parseMessage(text, NOW, {});
  if (!parsed.ok) throw new Error(`không phân tích được: ${parsed.error}`);
  if (parsed.entry.amount.kind !== 'exact') throw new Error('seam này không xử lý số tiền mơ hồ');
  const cutoffDay = cutoffOverride ?? cutoffDayFor(parsed.entry.source);
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

  it('quẹt thẻ ngày 10/8 → bảng tháng 9, mô tả mang tiền tố [cc]', () =>
    expect(destination('/food ăn trưa 40k cc')).toEqual({ table: 'food_9', description: '[cc] ăn trưa' }));

  it('quẹt thẻ ngày 3/8 chưa qua mốc → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 3/8 cc')).toEqual({ table: 'food_8', description: '[cc] ăn trưa' }));

  it('quẹt thẻ đúng ngày mốc 7/8 → vẫn bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 7/8 cc')).toEqual({ table: 'food_8', description: '[cc] ăn trưa' }));

  it('ghi lùi sang tháng trước: quẹt thẻ 10/7 → bảng tháng 8', () =>
    // Ngày 10/7 đã qua mốc của kỳ sao kê 7/7, nên rơi vào kỳ 7/8 và trả trong
    // tháng 8. Ghi lùi ngày và quy tắc thẻ tự khớp, không cần luật riêng.
    expect(destination('/food ăn trưa 40k 10/7 cc')).toEqual({ table: 'food_8', description: '[cc] ăn trưa' }));

  it('mốc chốt 4 đẩy ngày 5/8 sang bảng tháng 9', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 4)).toEqual({ table: 'food_9', description: '[cc] ăn trưa' }));

  it('cùng ngày 5/8 với mốc 7 thì ở lại bảng tháng 8', () =>
    expect(destination('/food ăn trưa 40k 5/8 cc', 7)).toEqual({ table: 'food_8', description: '[cc] ăn trưa' }));

  it('nhóm khác cũng đi theo cùng quy tắc', () =>
    expect(destination('/transport grab 55k cc')).toEqual({ table: 'transport_9', description: '[cc] grab' }));

  it('tiền mặt không bao giờ nhảy tháng, kể cả cuối tháng', () =>
    expect(destination('/other lặt vặt 30k 28/8')).toEqual({ table: 'other_8', description: 'lặt vặt' }));

  it('ô mô tả bằng đúng chữ người dùng gõ khi không có nguồn — không tiền tố', () =>
    expect(destination('/food ăn trưa 40k').description).toBe('ăn trưa'));

  it('token nguồn đứng ở vị trí nào trong câu cũng cho cùng kết quả', () => {
    expect(destination('/food cc ăn trưa 40k')).toEqual({ table: 'food_9', description: '[cc] ăn trưa' });
    expect(destination('/food ăn cc trưa 40k')).toEqual({ table: 'food_9', description: '[cc] ăn trưa' });
  });
});

describe('spl và zlp chạy đúng như cc, chỉ khác mốc chốt và tiền tố', () => {
  it('spl (mốc 24): ngày 20/8 chưa qua mốc → bảng tháng 8, tiền tố [spl]', () =>
    expect(destination('/food mua áo 250k 20/8 spl'))
      .toEqual({ table: 'food_8', description: '[spl] mua áo' }));

  it('spl: ngày 25/8 qua mốc 24 → bảng tháng 9', () =>
    expect(destination('/food mua áo 250k 25/8 spl'))
      .toEqual({ table: 'food_9', description: '[spl] mua áo' }));

  it('spl: đúng ngày mốc 24/8 vẫn ở bảng tháng 8', () =>
    expect(destination('/food mua áo 250k 24/8 spl'))
      .toEqual({ table: 'food_8', description: '[spl] mua áo' }));

  it('spl: ghi lùi ngày vẫn áp mốc của spl (25/7 qua mốc kỳ 24/7 → trả tháng 8)', () =>
    expect(destination('/food mua áo 250k 25/7 spl'))
      .toEqual({ table: 'food_8', description: '[spl] mua áo' }));

  it('zlp (mốc 28): ngày 20/8 chưa qua mốc → bảng tháng 8, tiền tố [zlp]', () =>
    expect(destination('/food trả góp 300k 20/8 zlp'))
      .toEqual({ table: 'food_8', description: '[zlp] trả góp' }));

  it('zlp: ngày 29/8 qua mốc 28 → bảng tháng 9', () =>
    expect(destination('/food trả góp 300k 29/8 zlp'))
      .toEqual({ table: 'food_9', description: '[zlp] trả góp' }));

  it('zlp: đúng ngày mốc 28/8 vẫn ở bảng tháng 8', () =>
    expect(destination('/food trả góp 300k 28/8 zlp'))
      .toEqual({ table: 'food_8', description: '[zlp] trả góp' }));

  it('cùng ngày 5/8 (trước cả ba mốc): cc, spl, zlp đều ở lại bảng tháng 8', () => {
    expect(destination('/food test 40k 5/8 cc').table).toBe('food_8');
    expect(destination('/food test 40k 5/8 spl').table).toBe('food_8');
    expect(destination('/food test 40k 5/8 zlp').table).toBe('food_8');
  });
});

describe('khoản trả sau vắt sang năm sau bị chặn ngay ở chuỗi này, cho cả ba nguồn', () => {
  it('quẹt thẻ 10/12 → từ chối, không có bảng nào nhận', () =>
    expect(() => destination('/food ăn trưa 40k 10/12 cc')).toThrow(/1\/2027/));

  it('spl 25/12 (qua mốc 24) → từ chối', () =>
    expect(() => destination('/food mua áo 250k 25/12 spl')).toThrow(/1\/2027/));

  it('zlp 29/12 (qua mốc 28) → từ chối', () =>
    expect(() => destination('/food trả góp 300k 29/12 zlp')).toThrow(/1\/2027/));

  it('tiền mặt 10/12 vẫn ghi bình thường', () =>
    expect(destination('/food ăn trưa 40k 10/12')).toEqual({ table: 'food_12', description: 'ăn trưa' }));
});
