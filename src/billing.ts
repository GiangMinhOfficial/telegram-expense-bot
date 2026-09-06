import type { VNDate } from './parse/date';
import type { DeferredSource } from './parse/message';

export type BillingTarget =
  | { ok: true; month: number }
  | { ok: false; error: string };

/**
 * Tháng mà tiền THẬT SỰ rời tài khoản.
 *
 * Sheet `Tóm tắt` dòng 26 là một dòng tiền chạy liên tục (`cuối kì = đầu kì +
 * thu nhập − tổng chi − đầu tư`, và đầu kì tháng sau lấy từ cuối kì tháng
 * trước), nên khoản chi phải nằm ở tháng tiền rời tài khoản chứ không phải
 * tháng tiêu.
 *
 * Tiền mặt ra ngay. Khoản có nguồn trả sau đi theo kỳ sao kê: kỳ đóng vào HẾT ngày
 * `cutoffDay`, nên ngày kế sau đó mở kỳ mới và rơi sang tháng sau. Xem mục 3.2
 * của spec để biết ba ví dụ của HSBC dùng để chốt ranh giới này.
 */
export function paymentMonth(
  date: VNDate, source: DeferredSource | null, cutoffDay: number,
): BillingTarget {
  if (!source || date.d <= cutoffDay) return { ok: true, month: date.m };

  if (date.m === 12) {
    return {
      ok: false,
      error: `Khoản này rơi vào kỳ trả tháng 1/${date.y + 1} — file ${date.y} chưa có chỗ.`,
    };
  }

  return { ok: true, month: date.m + 1 };
}
