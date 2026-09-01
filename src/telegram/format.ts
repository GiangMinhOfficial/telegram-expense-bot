import type { NoteConfig } from '../note';
import type { Amount } from '../parse/amount';
import type { VNDate } from '../parse/date';
import type { Totals } from '../graph/totals';

export const formatVND = (n: number): string =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

const dm = (d: VNDate) => `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Căn phải cột số trong khối <pre> để dễ đọc trên điện thoại. */
export function alignedRows(rows: [string, string][]): string {
  if (!rows.length) return '(chưa có khoản nào)';
  const labelW = Math.max(...rows.map((r) => r[0].length));
  const valueW = Math.max(...rows.map((r) => r[1].length));
  return rows.map(([l, v]) => `${l.padEnd(labelW)}  ${v.padStart(valueW)}`).join('\n');
}

export function confirmation(
  e: {
    description: string; amount: number; date: VNDate; label: string;
    isCard: boolean; targetMonth: number;
  },
  t: Totals,
  isToday: boolean,
): string {
  const head = [
    `✅ ${esc(e.description)} · ${formatVND(e.amount)} · ${dm(e.date)} → ${esc(e.label)}`,
  ];

  if (e.isCard) {
    head.push(
      e.targetMonth === e.date.m
        ? `💳 trả tháng ${e.targetMonth}`
        : `💳 tiêu ${dm(e.date)} → trả tháng ${e.targetMonth}`,
    );
  }

  const body = alignedRows([
    // Nhãn lấy theo THÁNG ĐÍCH. Lấy theo tháng phát sinh thì với khoản thẻ nhảy
    // tháng, con số hiện ra sẽ không chứa khoản vừa ghi.
    [`${e.label} (T${e.targetMonth})`, formatVND(t.categoryMonth)],
    // Khi ghi lùi ngày, dòng giữa phải là tổng của NGÀY ĐÓ, không phải hôm nay —
    // nếu không, con số hiện ra sẽ không chứa khoản vừa ghi.
    [isToday ? 'Hôm nay' : `Ngày ${dm(e.date)}`, formatVND(t.today)],
    [`Tổng chi T${e.targetMonth}`, formatVND(t.monthSpend)],
  ]);
  return `${head.join('\n')}\n\n<pre>${esc(body)}</pre>`;
}

/** Khoản thẻ tháng 12 rơi sang kỳ trả năm sau — in lại đủ để chép tay. */
export function carryOverRefusal(
  e: { description: string; amount: Amount; date: VNDate; label: string },
  error: string,
): string {
  const money = e.amount.kind === 'exact'
    ? formatVND(e.amount.amount)
    : `${formatVND(e.amount.low)} hoặc ${formatVND(e.amount.high)}`;

  return [
    `⚠️ ${esc(error)}`,
    `${esc(e.description)} · ${money} · ${dm(e.date)} · ${esc(e.label)}`,
    'Chép tay vào file sang năm nhé.',
  ].join('\n');
}

export function helpText(note: NoteConfig): string {
  const codes = Object.entries(note.shortcodes).map(([k, v]) => `${k} = ${v}`).join(' · ');
  return [
    '<b>Cú pháp</b>',
    '<code>/lệnh [ngày] mô tả số_tiền</code>',
    '',
    '<b>Lệnh ghi</b>',
    '/food /eat_out /transport /force /other /other_expense /income /invest /saving',
    '',
    '<b>Số tiền</b>',
    '40k · 1tr · 1tr5 · 1.5tr · 40.000 · 40000',
    'Số trần: 40 → 40.000đ · từ 1000–9999 bot sẽ hỏi lại',
    '',
    '<b>Ngày</b>',
    'bỏ trống = hôm nay · hqua · hkia · 5/8 · 8/8/2026',
    '',
    '<b>Thẻ tín dụng</b>',
    'Thêm <code>cc</code> khi quẹt thẻ: <code>/food ăn trưa 40k cc</code>',
    `Chốt sao kê ngày ${note.cutoffDay} — quẹt sau ngày đó thì tính vào tháng sau`,
    '',
    '<b>Lệnh khác</b>',
    '/undo /today /thang /reauth /help',
    '',
    `<b>Mã viết tắt</b>\n${esc(codes || '(chưa có)')}`,
  ].join('\n');
}

export function deviceCodePrompt(
  userCode: string, verificationUri: string, minutes: number,
): string {
  return [
    '🔑 <b>Cấp quyền lại OneDrive</b>',
    '',
    `1. Mở ${esc(verificationUri)}`,
    `2. Nhập mã <code>${esc(userCode)}</code>`,
    '3. Đăng nhập và bấm đồng ý',
    '',
    `Mã sống ${minutes} phút.`,
    '<b>Xong bước 3 thì gửi lại /reauth</b> để bot lấy quyền về.',
  ].join('\n');
}

/**
 * Trả refresh token mới ra chat để chép tay vào .dev.vars.
 *
 * D1 của Worker và .dev.vars là hai người giữ trên cùng một chuỗi token
 * (xem CONTEXT.md), nên bên nào dùng trước là bên kia chết. Dòng cảnh báo cuối
 * là cái giá đã biết và đã chọn của cách làm này.
 */
export function reauthDone(refreshToken: string): string {
  return [
    '✅ Đã cấp quyền lại. Bot ghi được rồi.',
    '',
    'Refresh token mới — chép vào <code>.dev.vars</code> để scripts chạy được:',
    `<code>${esc(refreshToken)}</code>`,
    '',
    '⚠️ Chạy bất kỳ script nào cũng làm token phía bot chết theo. Lúc đó gửi /reauth lần nữa.',
  ].join('\n');
}
