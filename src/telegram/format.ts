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
  e: { description: string; amount: number; date: VNDate; label: string },
  t: Totals,
  isToday: boolean,
): string {
  const head = `✅ ${esc(e.description)} · ${formatVND(e.amount)} · ${dm(e.date)} → ${esc(e.label)}`;
  const body = alignedRows([
    [`${e.label} (T${e.date.m})`, formatVND(t.categoryMonth)],
    // Khi ghi lùi ngày, dòng giữa phải là tổng của NGÀY ĐÓ, không phải hôm nay —
    // nếu không, con số hiện ra sẽ không chứa khoản vừa ghi.
    [isToday ? 'Hôm nay' : `Ngày ${dm(e.date)}`, formatVND(t.today)],
    [`Tổng chi T${e.date.m}`, formatVND(t.monthSpend)],
  ]);
  return `${head}\n\n<pre>${esc(body)}</pre>`;
}

export function helpText(shortcodes: Record<string, string>): string {
  const codes = Object.entries(shortcodes).map(([k, v]) => `${k} = ${v}`).join(' · ');
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
    '<b>Lệnh khác</b>',
    '/undo /today /thang /help',
    '',
    `<b>Mã viết tắt</b>\n${esc(codes || '(chưa có)')}`,
  ].join('\n');
}
