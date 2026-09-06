import { DEFERRED_SOURCES, type DeferredSource } from '../config';
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
    source: DeferredSource | null; targetMonth: number;
  },
  t: Totals,
  isToday: boolean,
): string {
  const head = [
    `✅ ${esc(e.description)} · ${formatVND(e.amount)} · ${dm(e.date)} → ${esc(e.label)}`,
  ];

  if (e.source) {
    const emoji = DEFERRED_SOURCES[e.source].emoji;
    head.push(
      e.targetMonth === e.date.m
        ? `${emoji} trả tháng ${e.targetMonth}`
        : `${emoji} tiêu ${dm(e.date)} → trả tháng ${e.targetMonth}`,
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

/**
 * Khoản trả sau tháng 12 rơi sang kỳ trả năm sau — in lại đủ để chép tay, cho
 * cả ba nguồn.
 *
 * Kèm emoji nguồn (không phải chữ, giống dòng nguồn trong `confirmation`) để
 * người chép tay biết viết tiền tố nào — mô tả ở đây vẫn là chữ người dùng gõ,
 * không ghép tiền tố (đó là việc riêng của `buildRow`).
 */
export function carryOverRefusal(
  e: {
    description: string; amount: Amount; date: VNDate; label: string;
    source: DeferredSource | null;
  },
  error: string,
): string {
  const money = e.amount.kind === 'exact'
    ? formatVND(e.amount.amount)
    : `${formatVND(e.amount.low)} hoặc ${formatVND(e.amount.high)}`;
  const sourceTag = e.source ? ` ${DEFERRED_SOURCES[e.source].emoji}` : '';

  return [
    `⚠️ ${esc(error)}`,
    `${esc(e.description)}${sourceTag} · ${money} · ${dm(e.date)} · ${esc(e.label)}`,
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
    '<b>Nguồn trả sau</b>',
    'Thêm một token, đặt đâu trong câu cũng được: <code>/food ăn trưa 40k spl</code>',
    'Quẹt sau ngày chốt thì tính vào tháng sau:',
    ...Object.entries(DEFERRED_SOURCES).map(
      ([token, s]) => `<code>${token}</code> ${s.emoji} ${s.label} — chốt ngày ${note.cutoffDays[token as DeferredSource]}`,
    ),
    '',
    '<b>Lệnh khác</b>',
    '/undo /today /thang /reauth /help',
    '',
    `<b>Mã viết tắt</b>\n${esc(codes || '(chưa có)')}`,
  ].join('\n');
}

export function reauthPrompt(authorizeUrl: string): string {
  return [
    '🔑 <b>Cấp quyền lại OneDrive</b>',
    '',
    `Mở link này và đăng nhập: ${esc(authorizeUrl)}`,
    '',
    'Xong bước đăng nhập, bot tự lấy quyền về — không cần gửi lại /reauth.',
  ].join('\n');
}

/**
 * Đăng nhập xong nhưng chưa tới lượt đổi thử (`adoptChainIfUsable`): Microsoft
 * từ chối redirect, hoặc chính bước đổi `code` lấy token thất bại. Khác
 * `reauthUnusable` — ở đây chưa từng có token nào để mà giữ hay ghi đè.
 */
export function reauthCodeFailed(error: string): string {
  return [
    '⚠️ Đăng nhập không hoàn tất, chưa đổi được quyền.',
    '',
    'Microsoft trả lời:',
    `<code>${esc(error)}</code>`,
    '',
    'Gửi /reauth trong Telegram để lấy link mới.',
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

/**
 * Cấp quyền xong nhưng chuỗi mới không đổi được: nói thẳng, kèm nguyên văn mã
 * lỗi để còn chẩn đoán.
 *
 * `keptChain` là kho token có chuỗi cũ để giữ lại hay không. Kho trống mà vẫn
 * hứa "bot ghi bình thường" là đúng cái kiểu trấn an sai ticket này đang dẹp:
 * lúc đó bot KHÔNG ghi được, và /reauth là đường dựng lại duy nhất.
 */
export function reauthUnusable(error: string, keptChain: boolean): string {
  return [
    '⚠️ Đã cấp quyền, nhưng chuỗi token mới không đổi được.',
    keptChain
      ? 'Chuỗi cũ trong kho được <b>giữ nguyên</b> — còn sống thì bot vẫn ghi bình thường.'
      : 'Kho token vẫn trống, <b>bot chưa ghi được</b>. Gửi /reauth để thử lại.',
    '',
    'Microsoft trả lời:',
    `<code>${esc(error)}</code>`,
  ].join('\n');
}
