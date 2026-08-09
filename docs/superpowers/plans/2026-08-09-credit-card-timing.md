# Kế hoạch triển khai: ghi chi tiêu thẻ tín dụng theo tháng thanh toán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khoản quẹt thẻ sau ngày chốt sao kê được ghi vào sheet của tháng thật sự trả tiền, và sửa lỗi khiến bảng mã viết tắt chưa bao giờ chạy.

**Architecture:** Thêm một hàm thuần `paymentMonth()` quyết định tháng đích từ ngày phát sinh, cờ thẻ và mốc chốt. Mốc chốt đọc từ ô `Note!B1` cùng lệnh gọi Graph vốn đã có để lấy bảng mã viết tắt. Gốc của lỗi mã viết tắt là chỉ số cột tuyệt đối áp lên mảng `usedRange` bắt đầu từ E4 — sửa bằng một lớp bù trừ offset dùng chung cho mọi chỗ đọc sheet.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), Cloudflare Workers, D1, Microsoft Graph Workbook API, Vitest.

**Spec:** [2026-08-08-credit-card-timing-design.md](../specs/2026-08-08-credit-card-timing-design.md)

## Global Constraints

- Bình luận trong mã và mọi câu bot gửi cho người dùng viết bằng **tiếng Việt**.
- `tsconfig.json` bật `strict` và `noUncheckedIndexedAccess` — mọi truy cập mảng theo chỉ số trả về `T | undefined`, phải xử lý.
- **Không bao giờ** commit `.dev.vars`. Không in giá trị bí mật ra log.
- Mốc chốt mặc định khi không đọc được: **7**. Khoảng hợp lệ: **1–28**.
- Từ khoá đánh dấu thẻ là **`cc`** và chỉ `cc` — không nhận `thẻ`, `the`, `td`.
- `cc` chỉ hợp lệ với 6 nhóm chi tiêu: `food`, `eat_out`, `transport`, `force`, `other`, `other_expense`.
- Quy tắc tháng đích: `tiền mặt → m` · `thẻ, d ≤ N → m` · `thẻ, d > N → m+1` · `thẻ, d > N, m = 12 → từ chối`.
- Chạy `npm test` và `npm run typecheck` trước mỗi commit.
- Script chạy tay **không được** đụng vào file gốc ngoài kịch bản đã mô tả ở Task 8.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/graph/sheet.ts` | **Mới.** Kiểu `SheetData` và hai hàm thuần `colOffset` / `cellAt` — bù trừ chỉ số cột cho vùng không bắt đầu từ A1 |
| `src/billing.ts` | **Mới.** Đúng một hàm thuần `paymentMonth()` — quy tắc tháng đích |
| `src/note.ts` | **Mới**, thay `src/shortcodes.ts`. Đọc sheet `Note`: bảng mã viết tắt **và** mốc chốt sao kê |
| `src/shortcodes.ts` | **Xoá.** Trách nhiệm đã rộng hơn tên gọi |
| `src/graph/workbook.ts` | Thêm `readRange()` đọc vùng cố định; tách `addRow` thành `appendRow` + `fixDateFormat` để chạy song song |
| `src/graph/totals.ts` | Dùng `cellAt`; tách `sumDay()` ra để cộng được hai sheet |
| `src/parse/message.ts` | Nhận và bóc token `cc`; từ chối `cc` với thu nhập/đầu tư/tiết kiệm |
| `src/telegram/format.ts` | Dòng `💳`; nhãn nhóm và tổng chi lấy theo **tháng đích**; câu từ chối khoản vắt năm |
| `src/handlers/write.ts` | Ghi vào bảng của tháng đích; cộng tổng ngày trên hai sheet; gộp lệnh gọi chạy song song |
| `src/handlers/query.ts` | `/today` cộng hai sheet |
| `src/router.ts`, `src/handlers/ambiguous.ts`, `src/handlers/outbox.ts` | Luồng `targetMonth` đi qua nút bấm và hàng đợi |
| `scripts/setup-note.mjs` | **Mới.** Ghi nhãn và mốc chốt vào `Note!A1:B1`, chỉ khi đang trống |
| `scripts/verify-card.mjs` | **Mới.** Kịch bản đầu-cuối trên file gốc |

---

## Task 1: Lớp bù trừ chỉ số cột

Gốc của lỗi ở mục 7 của spec. Làm trước vì Task 2 dựa vào nó.

**Files:**
- Create: `src/graph/sheet.ts`
- Create: `tests/sheet.test.ts`
- Modify: `src/graph/workbook.ts` (bỏ định nghĩa `SheetData`, import từ `sheet.ts`)
- Modify: `src/graph/totals.ts` (dùng `cellAt`, tách `sumDay`)
- Modify: `tests/totals.test.ts` (thêm ca vùng không bắt đầu từ A1)

**Interfaces:**
- Produces: `SheetData { address: string; values: unknown[][] }` · `colOffset(address: string): number` · `cellAt(row: unknown[], absCol: number, offset: number): unknown` · `sumDay(sheet: SheetData, daySerial: number): number`

- [ ] **Bước 1: Viết test cho `colOffset` và `cellAt`**

Tạo `tests/sheet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cellAt, colOffset } from '../src/graph/sheet';

describe('colOffset', () => {
  it('vùng bắt đầu từ A1 → 0', () =>
    expect(colOffset('Tháng 8!A1:O39')).toBe(0));

  it('vùng bắt đầu từ E4 → 4 — đây chính là hình dạng thật của sheet Note', () =>
    expect(colOffset('Note!E4:K12')).toBe(4));

  it('cột hai chữ cái', () =>
    expect(colOffset('Sheet1!AA1:AB2')).toBe(26));

  it('tên sheet có dấu nháy', () =>
    expect(colOffset("'Tháng 8'!E4:K12")).toBe(4));

  it('địa chỉ không có dấu chấm than → 0, không được ném lỗi', () =>
    expect(colOffset('hong')).toBe(0));
});

describe('cellAt', () => {
  const row = ['WM', 'Winmart', '', '', '', '/food', 'Ăn uống sinh hoạt'];

  it('bù trừ đúng: cột E của vùng bắt đầu từ E', () =>
    expect(cellAt(row, 4, 4)).toBe('WM'));

  it('bù trừ đúng: cột F của vùng bắt đầu từ E', () =>
    expect(cellAt(row, 5, 4)).toBe('Winmart'));

  it('không bù trừ: cột 0 của vùng bắt đầu từ A', () =>
    expect(cellAt(row, 0, 0)).toBe('WM'));

  it('cột nằm trước vùng đã đọc → undefined, không được trả nhầm ô khác', () =>
    expect(cellAt(row, 1, 4)).toBeUndefined());
});
```

- [ ] **Bước 2: Chạy test cho chắc là nó hỏng**

Chạy: `npx vitest run tests/sheet.test.ts`
Kỳ vọng: FAIL — `Cannot find module '../src/graph/sheet'`

- [ ] **Bước 3: Viết `src/graph/sheet.ts`**

```ts
export interface SheetData {
  /** Ví dụ: "Tháng 8!A1:O39" hoặc "Note!E4:K12" */
  address: string;
  values: unknown[][];
}

/**
 * Chỉ số cột (0-based) của ô đầu tiên trong vùng đã đọc.
 *
 * `usedRange` trả về từ ô CÓ DỮ LIỆU đầu tiên chứ không phải từ A1. Sheet `Note`
 * trống cột A–D nên nó bắt đầu ở E4, khiến mọi chỉ số cột tuyệt đối lệch đi 4 —
 * đúng lỗi đã khiến bảng mã viết tắt im lặng không chạy.
 */
export function colOffset(address: string): number {
  const m = /!\$?([A-Z]+)\$?\d+/.exec(address);
  if (!m?.[1]) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Đọc ô theo chỉ số cột TUYỆT ĐỐI (A=0, E=4, M=12), đã bù trừ offset.
 * Cột nằm trước vùng đã đọc trả về `undefined` chứ không cuộn sang ô khác.
 */
export function cellAt(row: unknown[], absCol: number, offset: number): unknown {
  const i = absCol - offset;
  return i >= 0 ? row[i] : undefined;
}
```

- [ ] **Bước 4: Chạy lại test**

Chạy: `npx vitest run tests/sheet.test.ts`
Kỳ vọng: PASS 9/9

- [ ] **Bước 5: Chuyển `SheetData` sang file mới**

Trong `src/graph/workbook.ts`, xoá khối định nghĩa `SheetData` (dòng 15–19) và thêm vào đầu file:

```ts
import type { SheetData } from './sheet';

export type { SheetData };
```

Đặt dòng `import type` cạnh các import sẵn có, còn `export type { SheetData }` ngay sau nhóm import — giữ lại đường dẫn cũ để các file khác không phải sửa import.

- [ ] **Bước 6: Viết lại `src/graph/totals.ts`**

Thay toàn bộ nội dung:

```ts
import { type SheetData, cellAt, colOffset } from './sheet';

export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng ĐÍCH */
  categoryMonth: number;
  /** Tổng chi của `daySerial` (không gồm thu nhập / đầu tư / tiết kiệm) */
  today: number;
  /** Tổng chi cả tháng ĐÍCH */
  monthSpend: number;
}

/** Chỉ số cột TUYỆT ĐỐI: A=0, E=4, I=8, M=12, N=13. */
const SPEND_BLOCKS = [0, 4] as const; // A:C và E:G — I:K là thu/đầu tư/tiết kiệm
const LABEL_COL = 12;
const VALUE_COL = 13;
const TOTAL_LABEL = 'Tổng chi';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Tổng chi của một ngày trên MỘT sheet.
 *
 * Tách riêng vì khoản quẹt thẻ nhảy tháng nằm ở sheet tháng thanh toán, còn chi
 * tiền mặt cùng ngày nằm ở sheet tháng phát sinh — phải cộng cả hai mới đúng.
 */
export function sumDay(sheet: SheetData, daySerial: number): number {
  const off = colOffset(sheet.address);
  let total = 0;
  for (const row of sheet.values) {
    for (const c of SPEND_BLOCKS) {
      const date = num(cellAt(row, c + 1, off));
      const amount = num(cellAt(row, c + 2, off));
      if (date === daySerial && amount !== null) total += amount;
    }
  }
  return total;
}

export function computeTotals(
  sheet: SheetData, categoryLabel: string, daySerial: number,
): Totals {
  const off = colOffset(sheet.address);
  let categoryMonth = 0;
  let monthSpend = 0;

  for (const row of sheet.values) {
    const label = text(cellAt(row, LABEL_COL, off));
    if (!label) continue;
    const v = num(cellAt(row, VALUE_COL, off));
    if (v === null) continue;
    if (label === categoryLabel) categoryMonth = v;
    else if (label === TOTAL_LABEL) monthSpend = v;
  }

  return { categoryMonth, today: sumDay(sheet, daySerial), monthSpend };
}
```

- [ ] **Bước 7: Thêm ca test hồi quy cho vùng không bắt đầu từ A1**

Thêm vào cuối `tests/totals.test.ts`, bên trong `describe('computeTotals', ...)`:

```ts
  it('vùng bắt đầu từ cột M vẫn đọc đúng bảng tổng hợp', () => {
    // Cắt 12 cột đầu và khai báo địa chỉ bắt đầu từ M — mô phỏng cách usedRange
    // hành xử khi sheet trống các cột bên trái. Khối chi tiêu A:C và E:G nằm
    // ngoài vùng này nên `today` phải bằng 0, KHÔNG được đọc nhầm sang cột khác.
    const onlySummary = {
      address: 'Tháng 8!M1:O10',
      values: sheet.values.map((r) => r.slice(12)),
    };
    const t = computeTotals(onlySummary, 'Ăn uống sinh hoạt', T);
    expect(t.categoryMonth).toBe(890_000);
    expect(t.monthSpend).toBe(3_240_000);
    expect(t.today).toBe(0);
  });
```

Thêm một `describe` mới ở cuối file:

```ts
describe('sumDay', () => {
  it('cộng đúng các khoản chi của một ngày', () =>
    expect(sumDay(sheet, T)).toBe(77_000));

  it('ngày không có khoản nào → 0', () =>
    expect(sumDay(sheet, 46_000)).toBe(0));
});
```

Sửa dòng import đầu file thành:

```ts
import { computeTotals, sumDay } from '../src/graph/totals';
```

- [ ] **Bước 8: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS (110 test cũ + 11 test mới = 121), typecheck sạch

- [ ] **Bước 9: Commit**

```bash
git add src/graph/sheet.ts src/graph/workbook.ts src/graph/totals.ts tests/sheet.test.ts tests/totals.test.ts
git commit -m "fix: bù trừ chỉ số cột cho vùng không bắt đầu từ A1"
```

---

## Task 2: Sửa lỗi đọc sheet Note, thêm mốc chốt sao kê

Sau task này, bung mã viết tắt chạy được lần đầu tiên trên production.

**Files:**
- Create: `src/note.ts`
- Create: `tests/note.test.ts`
- Delete: `src/shortcodes.ts`
- Modify: `src/graph/workbook.ts` (thêm `readRange`)
- Modify: `src/router.ts` (đổi `loadShortcodes` → `loadNote`)
- Modify: `src/telegram/format.ts` (`helpText` nhận `NoteConfig`)

**Interfaces:**
- Consumes: `SheetData`, `colOffset`, `cellAt` từ Task 1
- Produces: `NoteConfig { shortcodes: Record<string, string>; cutoffDay: number }` · `parseNote(sheet: SheetData): NoteConfig` · `loadNote(env: Env): Promise<NoteConfig>` · `DEFAULT_CUTOFF_DAY = 7` · `readRange(env: Env, sheet: string, address: string): Promise<SheetData>`

- [ ] **Bước 1: Viết test — ca đầu tiên chính là lỗi đã lên production**

Tạo `tests/note.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CUTOFF_DAY, parseNote } from '../src/note';

/** Đúng hình dạng usedRange thật của sheet Note: bắt đầu ở E4, 7 cột E..K. */
const usedRangeShape = {
  address: 'Note!E4:K12',
  values: [
    ['WM', 'Winmart', '', '', '', '/food', 'Ăn uống sinh hoạt'],
    ['TC', 'TocoToco', '', '', '', '/other', 'Linh tinh'],
    ['MT', 'Mầm Trà', '', '', '', '/force', 'Chi tiêu bắt buộc'],
    ['VM', 'V-mart', '', '', '', '/other_expense', 'Chi tiêu khác'],
    ['', '', '', '', '', '/transport', 'Phương tiện di chuyển'],
  ],
};

/** Vùng cố định A1:H6 — cái mà loadNote thật sự đọc. Cột A..H = chỉ số 0..7. */
const fixedRange = (b1: unknown) => ({
  address: 'Note!A1:H6',
  values: [
    ['Ngày chốt sao kê thẻ', b1, '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', 'WM', 'Winmart', '', ''],
    ['', '', '', '', 'TC', 'TocoToco', '', ''],
    ['', '', '', '', 'VM', 'V-mart', '', ''],
  ],
});

describe('bảng mã viết tắt', () => {
  it('HỒI QUY: vùng bắt đầu từ E4 vẫn đọc được mã — lỗi này đã lên production', () => {
    expect(parseNote(usedRangeShape).shortcodes).toEqual({
      WM: 'Winmart', TC: 'TocoToco', MT: 'Mầm Trà', VM: 'V-mart',
    });
  });

  it('vùng cố định bắt đầu từ A1 cũng đọc được', () =>
    expect(parseNote(fixedRange(7)).shortcodes).toEqual({
      WM: 'Winmart', TC: 'TocoToco', VM: 'V-mart',
    }));

  it('viết thường trong file vẫn tra được bằng chữ hoa', () =>
    expect(parseNote({
      address: 'Note!A1:F4',
      values: [['', '', '', '', 'wm', 'Winmart']],
    }).shortcodes).toEqual({ WM: 'Winmart' }));

  it('dòng thiếu tên đầy đủ thì bỏ qua', () =>
    expect(parseNote({
      address: 'Note!A1:F4',
      values: [['', '', '', '', 'XX', '   ']],
    }).shortcodes).toEqual({}));
});

describe('mốc chốt sao kê', () => {
  it('đọc số từ ô B1', () =>
    expect(parseNote(fixedRange(4)).cutoffDay).toBe(4));

  it('chuỗi số cũng nhận', () =>
    expect(parseNote(fixedRange('4')).cutoffDay).toBe(4));

  it('ô trống → mặc định 7', () =>
    expect(parseNote(fixedRange('')).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('không phải số → mặc định 7', () =>
    expect(parseNote(fixedRange('bảy')).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('0 nằm ngoài khoảng → mặc định 7', () =>
    expect(parseNote(fixedRange(0)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('29 nằm ngoài khoảng vì không phải tháng nào cũng có → mặc định 7', () =>
    expect(parseNote(fixedRange(29)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('số lẻ → mặc định 7', () =>
    expect(parseNote(fixedRange(7.5)).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('vùng không chứa ô B1 → mặc định 7, không được đọc nhầm ô khác', () =>
    expect(parseNote(usedRangeShape).cutoffDay).toBe(DEFAULT_CUTOFF_DAY));

  it('mảng rỗng → mặc định 7', () =>
    expect(parseNote({ address: 'Note!A1:H6', values: [] }).cutoffDay)
      .toBe(DEFAULT_CUTOFF_DAY));
});
```

- [ ] **Bước 2: Chạy test cho chắc là nó hỏng**

Chạy: `npx vitest run tests/note.test.ts`
Kỳ vọng: FAIL — `Cannot find module '../src/note'`

- [ ] **Bước 3: Thêm `readRange` vào `src/graph/workbook.ts`**

Thêm ngay sau hàm `readSheet`:

```ts
/**
 * Đọc một vùng CỐ ĐỊNH.
 *
 * Dùng cho sheet `Note`: `usedRange` của nó bắt đầu ở E4 nên chỉ số cột không ổn
 * định, còn `A1:Z50` thì cột A luôn là chỉ số 0. `Note` là sheet cấu hình, không
 * dài ra theo thời gian như sheet tháng, nên vùng cố định là đủ.
 */
export async function readRange(
  env: Env, sheet: string, address: string,
): Promise<SheetData> {
  const r = (await graphFetch(
    env,
    `${item(env)}/worksheets('${encodeURIComponent(sheet)}')` +
    `/range(address='${address}')?$select=address,values`,
  )) as { address: string; values: unknown[][] };
  return { address: r.address, values: r.values ?? [] };
}
```

`address` không bọc `encodeURIComponent` vì dấu hai chấm hợp lệ trong đường dẫn URL, và giá trị truyền vào là hằng số trong mã chứ không phải dữ liệu người dùng.

- [ ] **Bước 4: Viết `src/note.ts`**

```ts
import type { Env } from './env';
import { type SheetData, cellAt, colOffset } from './graph/sheet';
import { readRange } from './graph/workbook';

export interface NoteConfig {
  /** Mã viết tắt → tên đầy đủ. Nguồn: cột E–F của sheet Note */
  shortcodes: Record<string, string>;
  /** Ngày chốt sao kê thẻ. Nguồn: ô Note!B1 */
  cutoffDay: number;
}

export const DEFAULT_CUTOFF_DAY = 7;

/** Note là sheet cấu hình, không dài ra — vùng cố định là đủ và giữ chỉ số ổn định. */
const NOTE_RANGE = 'A1:Z50';

/** Chỉ số cột TUYỆT ĐỐI. */
const CUTOFF_COL = 1; // B
const CODE_COL = 4;   // E
const FULL_COL = 5;   // F

/**
 * Tách cấu hình từ sheet Note.
 *
 * Bảng mã viết tắt quét theo cột nên đọc được ở bất kỳ vùng nào. Mốc chốt nằm ở
 * ô B1 nên chỉ tìm thấy khi vùng bắt đầu từ dòng 1 — `loadNote` luôn truyền vùng
 * cố định A1 nên điều kiện đó luôn đúng; vùng khác thì lặng lẽ dùng mặc định.
 */
export function parseNote(sheet: SheetData): NoteConfig {
  const off = colOffset(sheet.address);

  const shortcodes: Record<string, string> = {};
  for (const row of sheet.values) {
    const code = cellAt(row, CODE_COL, off);
    const full = cellAt(row, FULL_COL, off);
    if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
      shortcodes[code.trim().toUpperCase()] = full.trim();
    }
  }

  return { shortcodes, cutoffDay: readCutoff(sheet, off) };
}

function readCutoff(sheet: SheetData, off: number): number {
  const firstRow = sheet.values[0];
  if (!firstRow) return DEFAULT_CUTOFF_DAY;

  const raw = cellAt(firstRow, CUTOFF_COL, off);
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);

  // Ngoài 1–28 là vô nghĩa: mốc 29–31 không tồn tại ở mọi tháng.
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : DEFAULT_CUTOFF_DAY;
}

/**
 * Cache ở phạm vi module. Isolate của Worker sống qua nhiều request nên phần lớn
 * tin nhắn dùng lại được — bảng mã viết tắt và mốc chốt về cùng một lệnh gọi.
 */
let cache: { at: number; data: NoteConfig } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadNote(env: Env): Promise<NoteConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const data = parseNote(await readRange(env, 'Note', NOTE_RANGE));
    cache = { at: Date.now(), data };
    return data;
  } catch {
    // Không đọc được thì vẫn phải ghi được chi tiêu: bỏ bung mã, dùng mốc mặc định.
    return cache?.data ?? { shortcodes: {}, cutoffDay: DEFAULT_CUTOFF_DAY };
  }
}
```

- [ ] **Bước 5: Chạy test**

Chạy: `npx vitest run tests/note.test.ts`
Kỳ vọng: PASS 14/14

- [ ] **Bước 6: Xoá `src/shortcodes.ts` và cập nhật nơi dùng**

```bash
git rm src/shortcodes.ts
```

Trong `src/router.ts`, đổi dòng import:

```ts
import { loadNote } from './note';
```

và hai chỗ gọi:

```ts
  if (/^\/help\b/i.test(text)) {
    await sendMessage(env, chatId, helpText(await loadNote(env)));
    return;
  }
```

```ts
  const note = await loadNote(env);
  const parsed = parseMessage(text, Date.now(), note.shortcodes);
```

Trong `src/telegram/format.ts`, đổi chữ ký `helpText` và thân hàm — thay dòng đầu và dòng cuối của mảng:

```ts
export function helpText(note: NoteConfig): string {
  const codes = Object.entries(note.shortcodes).map(([k, v]) => `${k} = ${v}`).join(' · ');
```

Thêm import ở đầu file:

```ts
import type { NoteConfig } from '../note';
```

- [ ] **Bước 7: Cập nhật `scripts/check-note.mjs` cho khớp mã mới**

Script này đang mô phỏng mã cũ để chứng minh lỗi. Để nguyên thì nó sẽ mãi báo lỗi
kể cả sau khi đã sửa — thành một cái bẫy cho người đọc sau. Thay hai khối cuối:

```js
const url =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/range(address='A1:Z50')?$select=address,values`;
```

và thay phần mô phỏng `loadShortcodes` bằng:

```js
// Mô phỏng đúng parseNote: chỉ số cột TUYỆT ĐỐI, bù trừ theo địa chỉ vùng đọc.
const m = /!\$?([A-Z]+)\$?\d+/.exec(address);
let off = 0;
if (m) { for (const ch of m[1]) off = off * 26 + (ch.charCodeAt(0) - 64); off -= 1; }

const at = (row, absCol) => (absCol - off >= 0 ? row[absCol - off] : undefined);

const codes = {};
for (const row of values) {
  const c = at(row, 4);
  const f = at(row, 5);
  if (typeof c === 'string' && typeof f === 'string' && c.trim() && f.trim()) {
    codes[c.trim().toUpperCase()] = f.trim();
  }
}

const rawCutoff = values[0] ? at(values[0], 1) : undefined;
const n = typeof rawCutoff === 'number' ? rawCutoff : Number.parseInt(String(rawCutoff ?? ''), 10);
const cutoff = Number.isInteger(n) && n >= 1 && n <= 28 ? n : 7;

console.log('');
console.log('ma viet tat :', JSON.stringify(codes));
console.log('moc chot    :', cutoff, Number.isInteger(n) && n >= 1 && n <= 28 ? '(doc tu B1)' : '(mac dinh)');
console.log(Object.keys(codes).length > 0 ? '=> OK' : '=> RONG — kiem tra lai cot E/F cua sheet Note');
```

- [ ] **Bước 8: Chạy thử với file thật**

Chạy: `node scripts/check-note.mjs`
Kỳ vọng: `address : Note!A1:Z50`, `ma viet tat : {"WM":"Winmart","TC":"TocoToco","MT":"Mầm Trà","VM":"V-mart"}`, `moc chot : 7 (mac dinh)` — ô B1 chưa đặt, Task 8 mới đặt.

Đây là lần đầu tiên bảng mã viết tắt đọc ra được dữ liệu.

- [ ] **Bước 9: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck sạch

- [ ] **Bước 10: Commit**

```bash
git add -A src/note.ts src/shortcodes.ts src/graph/workbook.ts src/router.ts src/telegram/format.ts tests/note.test.ts scripts/check-note.mjs
git commit -m "fix: sheet Note đọc bằng vùng cố định, thêm mốc chốt sao kê"
```

---

## Task 3: Nhận token `cc` trong bộ phân tích

**Files:**
- Modify: `src/parse/message.ts`
- Modify: `tests/message.test.ts`

**Interfaces:**
- Produces: `ParsedEntry` có thêm trường `isCard: boolean`

- [ ] **Bước 1: Viết test**

Thêm vào `tests/message.test.ts`, sau khối `describe('bung mã viết tắt', ...)`:

```ts
describe('đánh dấu quẹt thẻ', () => {
  it('không có cc → không phải khoản thẻ', () =>
    expect(ok('/food ăn trưa 40k').isCard).toBe(false));

  it('cc ở cuối', () => {
    const e = ok('/food ăn trưa 40k cc');
    expect(e.isCard).toBe(true);
    expect(e.description).toBe('ăn trưa');
  });

  it('cc ở giữa', () => {
    const e = ok('/food ăn trưa cc 40k');
    expect(e.isCard).toBe(true);
    expect(e.description).toBe('ăn trưa');
  });

  it('cc ngay sau lệnh', () => {
    const e = ok('/food cc ăn trưa 40k');
    expect(e.isCard).toBe(true);
    expect(e.description).toBe('ăn trưa');
  });

  it('CC viết hoa cũng nhận', () =>
    expect(ok('/food ăn trưa 40k CC').isCard).toBe(true));

  it('gõ hai lần vẫn tính là một', () => {
    const e = ok('/food cc ăn trưa 40k cc');
    expect(e.isCard).toBe(true);
    expect(e.description).toBe('ăn trưa');
  });

  it('cc đi cùng ngày lùi', () => {
    const e = ok('/food ăn trưa 40k hqua cc');
    expect(e.isCard).toBe(true);
    expect(e.date).toEqual({ y: 2026, m: 8, d: 7 });
    expect(e.description).toBe('ăn trưa');
  });

  it('HỒI QUY: "nạp thẻ" KHÔNG phải khoản quẹt thẻ', () => {
    // "nạp thẻ" là câu bình thường để ghi nạp thẻ điện thoại. Nếu "thẻ" là từ
    // khoá thì khoản này bị đẩy sang tháng sau mà không có dấu hiệu nào báo.
    const e = ok('/other nạp thẻ 100k');
    expect(e.isCard).toBe(false);
    expect(e.description).toBe('nạp thẻ');
  });

  it('"the" cũng không phải từ khoá', () =>
    expect(ok('/other mua the game 100k').isCard).toBe(false));

  it('cc dính liền chữ khác thì không phải từ khoá', () => {
    const e = ok('/other ccorp 40k');
    expect(e.isCard).toBe(false);
    expect(e.description).toBe('ccorp');
  });
});

describe('cc chỉ dùng cho nhóm chi tiêu', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi');
    return r.error;
  };

  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense'])(
    '/%s nhận cc', (c) => expect(ok(`/${c} test 10k cc`).isCard).toBe(true));

  it.each(['income', 'invest', 'saving'])(
    '/%s từ chối cc', (c) => expect(err(`/${c} test 10k cc`)).toMatch(/cc/i));

  it('chỉ có cc và số tiền → thiếu mô tả', () =>
    expect(err('/food cc 40k')).toMatch(/mô tả/i));
});
```

- [ ] **Bước 2: Chạy test cho chắc là nó hỏng**

Chạy: `npx vitest run tests/message.test.ts`
Kỳ vọng: FAIL — `isCard` là `undefined`, không phải `false`

- [ ] **Bước 3: Sửa `src/parse/message.ts`**

Thêm `isCard` vào interface:

```ts
export interface ParsedEntry {
  category: CategoryKey;
  description: string;
  date: VNDate;
  amount: Amount;
  /** Quẹt thẻ tín dụng — quyết định tháng đích, xem src/billing.ts */
  isCard: boolean;
}
```

Thêm hai hằng số ngay sau khối `MULTIWORD`:

```ts
/**
 * Chỉ nhận đúng `cc`, KHÔNG nhận `thẻ`/`the`/`td`.
 *
 * "/other nạp thẻ 100k" là câu hoàn toàn bình thường để ghi nạp thẻ điện thoại.
 * Nếu "thẻ" là từ khoá thì khoản đó bị đẩy sang tháng sau mà không có dấu hiệu
 * nào báo. `cc` không đụng từ tiếng Việt nào.
 */
const CARD_TOKEN = 'cc';

/** Thu nhập, đầu tư, tiết kiệm không phải khoản quẹt thẻ. */
const CARD_ALLOWED = new Set<CategoryKey>([
  'food', 'eat_out', 'transport', 'force', 'other', 'other_expense',
]);
```

Thay dòng `const tokens = parts.slice(1).filter(Boolean);` bằng:

```ts
  const raws = parts.slice(1).filter(Boolean);

  // Bóc token cc ra trước khi quét số tiền, ngày, mô tả.
  const tokens: string[] = [];
  let isCard = false;
  for (const t of raws) {
    if (t.toLowerCase() === CARD_TOKEN) { isCard = true; continue; }
    tokens.push(t);
  }

  if (isCard && !CARD_ALLOWED.has(cmd)) {
    return {
      ok: false,
      error: `cc chỉ dùng cho các nhóm chi tiêu, không dùng với /${cmd}.`,
    };
  }
```

Sửa dòng `return` cuối cùng:

```ts
  return { ok: true, entry: { category: cmd, description, date, amount, isCard } };
```

- [ ] **Bước 4: Chạy test**

Chạy: `npx vitest run tests/message.test.ts`
Kỳ vọng: PASS — 24 test cũ + 20 test mới

- [ ] **Bước 5: Sửa test cũ bị vỡ vì `toEqual` so khớp cả object**

Trong `tests/message.test.ts`, ca `/food ăn trưa 40k` ở khối `trường hợp cơ bản` dùng `toEqual` nên phải thêm trường mới:

```ts
    expect(ok('/food ăn trưa 40k')).toEqual({
      category: 'food', description: 'ăn trưa',
      date: { y: 2026, m: 8, d: 8 }, amount: { kind: 'exact', amount: 40_000 },
      isCard: false,
    });
```

- [ ] **Bước 6: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck sạch

- [ ] **Bước 7: Commit**

```bash
git add src/parse/message.ts tests/message.test.ts
git commit -m "feat: nhận token cc đánh dấu khoản quẹt thẻ"
```

---

## Task 4: Quy tắc tháng thanh toán

**Files:**
- Create: `src/billing.ts`
- Create: `tests/billing.test.ts`

**Interfaces:**
- Consumes: `VNDate` từ `src/parse/date.ts`
- Produces: `BillingTarget` · `paymentMonth(date: VNDate, isCard: boolean, cutoffDay: number): BillingTarget`

- [ ] **Bước 1: Viết test**

Tạo `tests/billing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paymentMonth } from '../src/billing';

const d = (m: number, day: number) => ({ y: 2026, m, d: day });
const month = (m: number, day: number, isCard: boolean, cutoff = 7) => {
  const r = paymentMonth(d(m, day), isCard, cutoff);
  if (!r.ok) throw new Error(`kỳ vọng thành công, nhận lỗi: ${r.error}`);
  return r.month;
};

describe('tiền mặt luôn nằm ở tháng phát sinh', () => {
  it.each([1, 6, 7, 8, 20, 31])('ngày %i', (day) =>
    expect(month(8, day, false)).toBe(8));
});

describe('thẻ đi theo kỳ sao kê', () => {
  it.each([1, 2, 6])('ngày %i trước mốc → tháng đó', (day) =>
    expect(month(8, day, true)).toBe(8));

  it('ĐÚNG NGÀY MỐC → tháng đó (kỳ sao kê đóng vào hết ngày mùng 7)', () =>
    expect(month(8, 7, true)).toBe(8));

  it.each([8, 9, 15, 31])('ngày %i sau mốc → tháng sau', (day) =>
    expect(month(8, day, true)).toBe(9));

  it('tháng 11 sang tháng 12 vẫn chạy', () =>
    expect(month(11, 20, true)).toBe(12));
});

describe('mốc chốt lấy từ tham số, không viết cứng', () => {
  it('mốc 4: ngày 4 → tháng đó', () =>
    expect(month(8, 4, true, 4)).toBe(8));

  it('mốc 4: ngày 5 → tháng sau (mốc 7 thì vẫn là tháng đó)', () => {
    expect(month(8, 5, true, 4)).toBe(9);
    expect(month(8, 5, true, 7)).toBe(8);
  });
});

describe('khoản thẻ vắt sang năm sau', () => {
  it('tháng 12 sau mốc → từ chối', () => {
    const r = paymentMonth(d(12, 10), true, 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1\/2027/);
  });

  it('tháng 12 trước mốc vẫn ghi được vào tháng 12', () =>
    expect(month(12, 3, true)).toBe(12));

  it('tháng 12 tiền mặt không bị ảnh hưởng', () =>
    expect(month(12, 25, false)).toBe(12));
});
```

- [ ] **Bước 2: Chạy test cho chắc là nó hỏng**

Chạy: `npx vitest run tests/billing.test.ts`
Kỳ vọng: FAIL — `Cannot find module '../src/billing'`

- [ ] **Bước 3: Viết `src/billing.ts`**

```ts
import type { VNDate } from './parse/date';

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
 * Tiền mặt ra ngay. Khoản quẹt thẻ đi theo kỳ sao kê: kỳ đóng vào HẾT ngày
 * `cutoffDay`, nên ngày kế sau đó mở kỳ mới và rơi sang tháng sau. Xem mục 3.2
 * của spec để biết ba ví dụ của HSBC dùng để chốt ranh giới này.
 */
export function paymentMonth(
  date: VNDate, isCard: boolean, cutoffDay: number,
): BillingTarget {
  if (!isCard || date.d <= cutoffDay) return { ok: true, month: date.m };

  if (date.m === 12) {
    return {
      ok: false,
      error: `Khoản này rơi vào kỳ trả tháng 1/${date.y + 1} — file ${date.y} chưa có chỗ.`,
    };
  }

  return { ok: true, month: date.m + 1 };
}
```

- [ ] **Bước 4: Chạy test**

Chạy: `npx vitest run tests/billing.test.ts`
Kỳ vọng: PASS 20/20

- [ ] **Bước 5: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck sạch

- [ ] **Bước 6: Commit**

```bash
git add src/billing.ts tests/billing.test.ts
git commit -m "feat: quy tắc tháng thanh toán theo kỳ sao kê"
```

---

## Task 5: Gộp các lệnh gọi Graph chạy song song

Thuần refactor, chưa động tới thẻ. Tách ra làm trước vì nó tự nó có giá trị —
mỗi tin nhắn phản hồi nhanh hơn — và vì Task 6 cần `appendRow`/`fixDateFormat`
đã tách sẵn thì mới gộp thêm được lệnh đọc sheet thứ hai.

**Files:**
- Modify: `src/graph/workbook.ts`
- Modify: `src/handlers/write.ts`

**Interfaces:**
- Produces: `appendRow(env, table, values): Promise<number>` · `fixDateFormat(env, table, index): Promise<void>`

- [ ] **Bước 1: Tách `addRow` trong `src/graph/workbook.ts`**

Thay hàm `addRow` bằng hai hàm:

```ts
/** Nối một dòng vào cuối bảng. Trả về chỉ số dòng (0-based) để /undo dùng lại. */
export async function appendRow(
  env: Env, table: string, values: [string, number, number],
): Promise<number> {
  const r = (await graphFetch(env, `${tbl(env, table)}/rows/add`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  })) as { index?: number };
  if (typeof r.index !== 'number') throw new Error('Graph không trả về index của dòng vừa thêm');
  return r.index;
}

/**
 * Vá định dạng cột Ngày cho dòng vừa thêm.
 *
 * `null` ở hai cột kia để giữ nguyên định dạng sẵn có — cột số tiền đã có định
 * dạng tiền tệ VND. Tách khỏi `appendRow` để chạy song song với các lệnh đọc:
 * nó chỉ đổi `numberFormat`, không đụng tới `values`, nên không ảnh hưởng kết
 * quả đọc dù hai lệnh chạy chồng lên nhau.
 */
export async function fixDateFormat(
  env: Env, table: string, index: number,
): Promise<void> {
  await graphFetch(env, `${tbl(env, table)}/rows/itemAt(index=${index})/range`, {
    method: 'PATCH',
    body: JSON.stringify({ numberFormat: [[null, DATE_FORMAT, null]] }),
  });
}
```

- [ ] **Bước 2: Gộp lệnh gọi trong `src/handlers/write.ts`**

Đổi dòng import:

```ts
import { appendRow, fixDateFormat, readSheet } from '../graph/workbook';
```

Thay thân hàm `performWrite` từ dòng `const index = ...` tới trước dòng `const today = ...`:

```ts
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
```

- [ ] **Bước 3: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck sạch

- [ ] **Bước 4: Kiểm tra bản dựng cho Worker**

Chạy: `npx wrangler deploy --dry-run`
Kỳ vọng: dựng xong, in ra kích thước gói

- [ ] **Bước 5: Commit**

```bash
git add src/graph/workbook.ts src/handlers/write.ts
git commit -m "perf: vá định dạng, ghi D1 và đọc tổng chạy song song"
```

---

## Task 6: Dòng phản hồi và luồng thẻ

Task này đổi chữ ký `confirmation` nên phải sửa luôn nơi gọi trong cùng một
task — tách ra sẽ để lại repo không typecheck được.

**Files:**
- Modify: `src/telegram/format.ts`
- Modify: `tests/format.test.ts`
- Modify: `src/handlers/write.ts`
- Modify: `src/router.ts`
- Modify: `src/handlers/ambiguous.ts`
- Modify: `src/handlers/outbox.ts`

**Interfaces:**
- Consumes: `paymentMonth` (Task 4), `sumDay` (Task 1), `loadNote` (Task 2), `appendRow`/`fixDateFormat` (Task 5), `Totals`, `Amount`
- Produces: `confirmation(e, t, isToday)` với `e` có thêm `isCard: boolean` và `targetMonth: number` · `carryOverRefusal(e, error): string` · `ExactEntry` có thêm `targetMonth: number` · `askAmount(env, chatId, entry, targetMonth, low, high)`

- [ ] **Bước 1: Viết test**

Thêm vào `tests/format.test.ts`:

```ts
import { carryOverRefusal, confirmation } from '../src/telegram/format';

const T = { categoryMonth: 215_000, today: 117_000, monthSpend: 2_503_667 };
const base = {
  description: 'cơm trưa', amount: 40_000,
  date: { y: 2026, m: 8, d: 10 }, label: 'Ăn uống sinh hoạt',
};

describe('confirmation với khoản thẻ', () => {
  it('tiền mặt không có dòng thẻ', () => {
    const s = confirmation({ ...base, isCard: false, targetMonth: 8 }, T, false);
    expect(s).not.toContain('💳');
  });

  it('thẻ không nhảy tháng', () => {
    const s = confirmation(
      { ...base, date: { y: 2026, m: 8, d: 3 }, isCard: true, targetMonth: 8 }, T, false);
    expect(s).toContain('💳 trả tháng 8');
  });

  it('thẻ nhảy tháng nói rõ cả ngày tiêu lẫn tháng trả', () => {
    const s = confirmation({ ...base, isCard: true, targetMonth: 9 }, T, false);
    expect(s).toContain('💳 tiêu 10/08 → trả tháng 9');
  });

  it('nhãn nhóm mang THÁNG ĐÍCH, không mang tháng phát sinh', () => {
    const s = confirmation({ ...base, isCard: true, targetMonth: 9 }, T, false);
    expect(s).toContain('Ăn uống sinh hoạt (T9)');
    expect(s).not.toContain('Ăn uống sinh hoạt (T8)');
  });

  it('nhãn tổng chi cũng mang THÁNG ĐÍCH', () => {
    const s = confirmation({ ...base, isCard: true, targetMonth: 9 }, T, false);
    expect(s).toContain('Tổng chi T9');
    expect(s).not.toContain('Tổng chi T8');
  });

  it('ghi hôm nay thì dòng giữa ghi "Hôm nay"', () => {
    const s = confirmation({ ...base, isCard: false, targetMonth: 8 }, T, true);
    expect(s).toContain('Hôm nay');
  });

  it('ghi lùi ngày thì dòng giữa mang ngày đó', () => {
    const s = confirmation({ ...base, isCard: false, targetMonth: 8 }, T, false);
    expect(s).toContain('Ngày 10/08');
  });
});

describe('carryOverRefusal', () => {
  const e = {
    description: 'cơm trưa', date: { y: 2026, m: 12, d: 10 },
    label: 'Ăn uống sinh hoạt',
  };
  const err = 'Khoản này rơi vào kỳ trả tháng 1/2027 — file 2026 chưa có chỗ.';

  it('in lại đủ mô tả, số tiền, ngày để chép tay', () => {
    const s = carryOverRefusal(
      { ...e, amount: { kind: 'exact', amount: 40_000 } }, err);
    expect(s).toContain('cơm trưa');
    expect(s).toContain('40.000đ');
    expect(s).toContain('10/12');
    expect(s).toContain('1/2027');
  });

  it('số tiền mơ hồ thì in cả hai khả năng', () => {
    const s = carryOverRefusal(
      { ...e, amount: { kind: 'ambiguous', low: 3_000, high: 3_000_000 } }, err);
    expect(s).toContain('3.000đ');
    expect(s).toContain('3.000.000đ');
  });
});
```

- [ ] **Bước 2: Sửa fixture `confirmation` sẵn có trong cùng file**

Khối `describe('confirmation', ...)` đang có sẵn dùng fixture thiếu hai trường mới.
Vitest chạy qua esbuild nên nó vẫn chạy được, nhưng `npm run typecheck` phủ cả
`tests/**/*.ts` nên sẽ đỏ. Thêm hai trường vào fixture:

```ts
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt',
    isCard: false, targetMonth: 8,
  };
```

Thêm luôn một ca chốt chặn cho chính lỗi vừa tránh được — nhãn không được ra
`(Tundefined)`:

```ts
  it('nhãn nhóm luôn có số tháng, không bao giờ là undefined', () =>
    expect(html).toContain('(T8)'));
```

- [ ] **Bước 3: Chạy test cho chắc là nó hỏng**

Chạy: `npx vitest run tests/format.test.ts`
Kỳ vọng: FAIL — `carryOverRefusal` chưa tồn tại, và các ca `targetMonth` vẫn hiện `(T8)` cho khoản đáng lẽ phải là `(T9)`

- [ ] **Bước 4: Sửa `confirmation` trong `src/telegram/format.ts`**

Thay toàn bộ hàm `confirmation`:

```ts
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
    // Dòng giữa mang ngày CỦA KHOẢN VỪA GHI, không phải hôm nay — để khi ghi lùi
    // ngày con số vẫn chứa khoản đó.
    [isToday ? 'Hôm nay' : `Ngày ${dm(e.date)}`, formatVND(t.today)],
    [`Tổng chi T${e.targetMonth}`, formatVND(t.monthSpend)],
  ]);

  return `${head.join('\n')}\n\n<pre>${esc(body)}</pre>`;
}
```

- [ ] **Bước 5: Thêm `carryOverRefusal` vào cùng file**

Thêm ngay sau `confirmation`:

```ts
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
```

Thêm import ở đầu file:

```ts
import type { Amount } from '../parse/amount';
```

- [ ] **Bước 6: Bổ sung phần thẻ vào `helpText`**

Trong `helpText`, chèn vào mảng — ngay trước dòng `'<b>Lệnh khác</b>',`:

```ts
    '<b>Thẻ tín dụng</b>',
    'Thêm <code>cc</code> khi quẹt thẻ: <code>/food ăn trưa 40k cc</code>',
    `Chốt sao kê ngày ${note.cutoffDay} — quẹt sau ngày đó thì tính vào tháng sau`,
    '',
```

- [ ] **Bước 7: Chạy test của format**

Chạy: `npx vitest run tests/format.test.ts`
Kỳ vọng: PASS

Typecheck lúc này còn đỏ ở `src/handlers/write.ts` vì `confirmation` đã đòi thêm
hai trường. Các bước sau sửa nốt — **chưa commit** cho tới khi xanh hết.

- [ ] **Bước 8: Viết lại `src/handlers/write.ts`**

Thay toàn bộ nội dung:

```ts
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
  const totals = computeTotals(dest, label, serial);
  if (origin) totals.today += sumDay(origin, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(env, chatId, confirmation({ ...e, label }, totals, isToday));
}
```

- [ ] **Bước 9: Sửa `src/handlers/ambiguous.ts`**

Đổi chữ ký `askAmount` để mang theo tháng đích, và bọc `takePending` cho bản ghi cũ:

```ts
export async function askAmount(
  env: Env, chatId: number, entry: ParsedEntry,
  targetMonth: number, low: number, high: number,
): Promise<void> {
  const id = crypto.randomUUID().slice(0, 8);
  await putPending(env.DB, {
    id, chatId, payloadJson: JSON.stringify({ ...entry, targetMonth, low, high }),
  });
  // phần gửi tin nhắn giữ nguyên
```

Trong `resolveAmount`, thay khối dựng `exact`:

```ts
  const p = JSON.parse(pending.payloadJson) as ParsedEntry & {
    low: number; high: number; targetMonth?: number;
  };
  const exact: ExactEntry = {
    category: p.category, description: p.description, date: p.date,
    // Bản ghi chờ tạo trước khi có tính năng thẻ thì không có hai trường này.
    isCard: p.isCard ?? false,
    targetMonth: p.targetMonth ?? p.date.m,
    amount: which === 'hi' ? p.high : p.low,
  };
```

- [ ] **Bước 10: Sửa `src/handlers/outbox.ts`**

Thay dòng `const entry = JSON.parse(...)` bằng:

```ts
      const raw = JSON.parse(it.payloadJson) as ExactEntry & {
        isCard?: boolean; targetMonth?: number;
      };
      // Khoản vào hàng đợi trước khi có tính năng thẻ thì thiếu hai trường này.
      const entry: ExactEntry = {
        ...raw,
        isCard: raw.isCard ?? false,
        targetMonth: raw.targetMonth ?? raw.date.m,
      };
      await performWrite(env, it.chatId, entry);
```

- [ ] **Bước 11: Sửa `src/router.ts`**

Thay khối từ `const { entry } = parsed;` tới hết chỗ dựng `exact`:

```ts
  const { entry } = parsed;

  const target = paymentMonth(entry.date, entry.isCard, note.cutoffDay);
  if (!target.ok) {
    await sendMessage(
      env, chatId,
      carryOverRefusal({ ...entry, label: CATEGORIES[entry.category].label }, target.error),
    );
    return;
  }

  if (entry.amount.kind === 'ambiguous') {
    await askAmount(env, chatId, entry, target.month, entry.amount.low, entry.amount.high);
    return;
  }

  const exact: ExactEntry = {
    ...entry, amount: entry.amount.amount, targetMonth: target.month,
  };
```

Thêm import:

```ts
import { paymentMonth } from './billing';
import { CATEGORIES } from './config';
import type { ExactEntry } from './handlers/write';
import { carryOverRefusal, helpText } from './telegram/format';
```

- [ ] **Bước 12: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck **sạch trở lại**

- [ ] **Bước 13: Kiểm tra bản dựng cho Worker**

Chạy: `npx wrangler deploy --dry-run`
Kỳ vọng: dựng xong, in ra kích thước gói

- [ ] **Bước 14: Commit**

```bash
git add src/telegram/format.ts tests/format.test.ts src/handlers/write.ts src/handlers/ambiguous.ts src/handlers/outbox.ts src/router.ts
git commit -m "feat: ghi khoản thẻ vào bảng của tháng thanh toán"
```

---

## Task 7: `/today` cộng hai sheet

**Files:**
- Modify: `src/handlers/query.ts`

- [ ] **Bước 1: Viết lại `src/handlers/query.ts`**

Thay toàn bộ nội dung:

```ts
import { CATEGORIES, sheetName } from '../config';
import type { Env } from '../env';
import { cellAt, colOffset } from '../graph/sheet';
import { readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import { sendMessage } from '../telegram/api';
import { alignedRows, formatVND } from '../telegram/format';

/** Chỉ số cột TUYỆT ĐỐI: A=0, E=4, M=12, N=13. */
const SPEND_BLOCKS = [0, 4] as const;
const LABEL_COL = 12;
const VALUE_COL = 13;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function handleToday(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const serial = toExcelSerial(today);

  // Khoản quẹt thẻ hôm nay đã nằm ở sheet tháng sau nếu hôm nay qua mốc chốt.
  // Đọc cả hai rồi lọc theo ngày — không cần biết mốc chốt là bao nhiêu.
  const [cur, next] = await Promise.all([
    readSheet(env, sheetName(today.m)),
    today.m < 12 ? readSheet(env, sheetName(today.m + 1)) : Promise.resolve(null),
  ]);

  const items: [string, string][] = [];
  let total = 0;
  for (const data of [cur, next]) {
    if (!data) continue;
    const off = colOffset(data.address);
    for (const row of data.values) {
      for (const c of SPEND_BLOCKS) {
        const desc = text(cellAt(row, c, off));
        const d = num(cellAt(row, c + 1, off));
        const amt = num(cellAt(row, c + 2, off));
        if (d === serial && amt !== null && desc) {
          items.push([desc.slice(0, 22), formatVND(amt)]);
          total += amt;
        }
      }
    }
  }

  const dm = `${String(today.d).padStart(2, '0')}/${String(today.m).padStart(2, '0')}`;
  await sendMessage(
    env, chatId,
    `<b>Hôm nay ${dm}</b>\n<pre>${alignedRows(items)}</pre>\n<b>Tổng: ${formatVND(total)}</b>`,
  );
}

export async function handleMonth(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const data = await readSheet(env, sheetName(today.m));
  const off = colOffset(data.address);

  const wanted = new Set<string>(Object.values(CATEGORIES).map((c) => c.label));
  const rows: [string, string][] = [];
  let spend = 0;
  let income = 0;

  for (const row of data.values) {
    const label = text(cellAt(row, LABEL_COL, off));
    const v = num(cellAt(row, VALUE_COL, off));
    if (!label || v === null) continue;
    if (label === 'Tổng chi') { spend = v; continue; }
    if (label === CATEGORIES.income.label) { income = v; continue; }
    if (wanted.has(label)) rows.push([label, formatVND(v)]);
  }

  // Nghĩa đã đổi từ khi có tính năng thẻ: đây là tiền RỜI TÀI KHOẢN trong tháng,
  // không phải tiền tiêu trong tháng.
  await sendMessage(
    env, chatId,
    `<b>Tháng ${today.m}</b>\n<pre>${alignedRows(rows)}</pre>\n` +
    `<b>Tổng chi: ${formatVND(spend)}</b>\nThu nhập: ${formatVND(income)}`,
  );
}
```

- [ ] **Bước 2: Chạy toàn bộ test và typecheck**

Chạy: `npm test && npm run typecheck`
Kỳ vọng: tất cả PASS, typecheck sạch

- [ ] **Bước 3: Commit**

```bash
git add src/handlers/query.ts
git commit -m "feat: /today cộng khoản thẻ đã nằm ở sheet tháng sau"
```

---

## Task 8: Đặt ô cấu hình và kiểm chứng trên file gốc

**Files:**
- Create: `scripts/setup-note.mjs`
- Create: `scripts/verify-card.mjs`
- Modify: `package.json` (thêm hai script)
- Modify: `README.md` (mục hướng dẫn dùng `cc`)

- [ ] **Bước 1: Viết `scripts/setup-note.mjs`**

```js
// Đặt nhãn và mốc chốt sao kê vào Note!A1:B1 — CHỈ khi cả hai ô đang trống.
//
// Từ chối ghi đè: nếu đã có gì ở đó thì in ra rồi dừng, để người dùng tự quyết.
import { loadEnv, getAccessToken } from './lib/dev-vars.mjs';

const LABEL = 'Ngày chốt sao kê thẻ';
const DEFAULT_CUTOFF = 7;

const env = loadEnv();
const token = await getAccessToken(env);
const base =
  `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('Note')/range(address='A1:B1')`;

const call = async (init) => {
  const res = await fetch(base, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    console.error('Graph loi', res.status, await res.text());
    process.exit(1);
  }
  return res.json();
};

const before = await call({});
const [a1, b1] = before.values?.[0] ?? ['', ''];
console.log(`Truoc: A1=${JSON.stringify(a1)}  B1=${JSON.stringify(b1)}`);

const empty = (v) => v === '' || v === null || v === undefined;
if (!empty(a1) || !empty(b1)) {
  console.log('Hai o nay da co noi dung. KHONG ghi de. Tu sua trong Excel neu can.');
  process.exit(0);
}

await call({ method: 'PATCH', body: JSON.stringify({ values: [[LABEL, DEFAULT_CUTOFF]] }) });

const after = await call({});
console.log(`Sau  : A1=${JSON.stringify(after.values?.[0]?.[0])}  B1=${JSON.stringify(after.values?.[0]?.[1])}`);
console.log('Xong. Doi moc chot = sua o B1 trong Excel, khong can deploy lai.');
```

- [ ] **Bước 2: Viết `scripts/verify-card.mjs`**

```js
// Kiem chung dau-cuoi tren FILE GOC: khoan the sau moc chot phai nam o thang sau.
//
// Kich ban: doc Tom tat truoc → ghi 1 khoan the → kiem tra vi tri va Tom tat →
// /undo → kiem tra da tro ve nguyen trang. Tu bao SACH hoac BAN.
import { loadEnv, getAccessToken } from './lib/dev-vars.mjs';

const env = loadEnv();
const token = await getAccessToken(env);
const WB = `https://graph.microsoft.com/v1.0/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

const g = async (path, init) => {
  const res = await fetch(`${WB}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Ngay phat sinh: hom nay. Chon thang sao cho khoan the chac chan nhay thang.
const CUTOFF = (await g(`/worksheets('Note')/range(address='B1')?$select=values`))
  .values?.[0]?.[0] ?? 7;
console.log(`Moc chot doc tu Note!B1: ${CUTOFF}`);

const day = Number(CUTOFF) + 1;
const now = new Date(Date.now() + 7 * 3600 * 1000); // gio Viet Nam
const year = now.getUTCFullYear();
const month = now.getUTCMonth() + 1;
if (month === 12) {
  console.log('Thang 12: khoan the sau moc chot bi tu choi theo thiet ke. Bo qua kich ban nay.');
  process.exit(0);
}
const serial = Math.round(
  (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);

const AMOUNT = 12_345;
const DESC = `KIEM CHUNG THE ${Date.now()}`;
const srcTable = `food_${month}`;
const dstTable = `food_${month + 1}`;

// Dong 10 cua Tom tat la "An uong sinh hoat", cot B..M la thang 1..12.
// Ten sheet co dau nen phai ma hoa truoc khi ghep vao URL.
const SUMMARY = `/worksheets('${encodeURIComponent('Tóm tắt')}')/range(address='B10:M10')?$select=values`;
const summary = async () => (await g(SUMMARY)).values?.[0] ?? [];

// Cot B la thang 1 → thang N nam o chi so N-1.
const before = await summary();

const added = await g(`/tables/${dstTable}/rows/add`, {
  method: 'POST', body: JSON.stringify({ values: [[DESC, serial, AMOUNT]] }),
});
console.log(`Da ghi vao ${dstTable}, index ${added.index}`);

const rowsOf = async (t) => (await g(`/tables/${t}/rows?$select=values`)).value ?? [];
const inDst = (await rowsOf(dstTable)).some((r) => r.values?.[0]?.[0] === DESC);
const inSrc = (await rowsOf(srcTable)).some((r) => r.values?.[0]?.[0] === DESC);
check(`dong nam o ${dstTable}`, inDst);
check(`dong KHONG nam o ${srcTable}`, !inSrc);

const mid = await summary();
check(
  `Tom tat cot thang ${month + 1} tang dung ${AMOUNT}`,
  Number(mid[month]) - Number(before[month]) === AMOUNT,
  `${before[month]} → ${mid[month]}`,
);
check(
  `Tom tat cot thang ${month} dung yen`,
  Number(mid[month - 1]) === Number(before[month - 1]),
  `${before[month - 1]} → ${mid[month - 1]}`,
);

await g(`/tables/${dstTable}/rows/itemAt(index=${added.index})`, { method: 'DELETE' });
const after = await summary();
check(
  'sau khi xoa, Tom tat tro ve nguyen trang',
  JSON.stringify(after) === JSON.stringify(before),
);
check(
  'khong con dong rac nao',
  !(await rowsOf(dstTable)).some((r) => r.values?.[0]?.[0] === DESC),
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? 'SACH' : `BAN — ${failed.length} muc that bai`}`);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Bước 3: Thêm script vào `package.json`**

Trong `"scripts"`, thêm hai dòng:

```json
    "setup:note": "node scripts/setup-note.mjs",
    "verify:card": "node scripts/verify-card.mjs",
```

- [ ] **Bước 4: Đặt ô cấu hình vào file gốc**

Chạy: `npm run setup:note`
Kỳ vọng: in `Truoc: A1="" B1=""` rồi `Sau : A1="Ngày chốt sao kê thẻ" B1=7`

Nếu in ra `Hai o nay da co noi dung` thì dừng lại, đọc giá trị đang có rồi hỏi người dùng trước khi làm tiếp.

- [ ] **Bước 5: Xác nhận mốc chốt đã đọc được**

Chạy: `node scripts/check-note.mjs`
Kỳ vọng: `moc chot : 7 (doc tu B1)` — khác với `(mac dinh)` ở Task 2, chứng minh giá trị thật sự đến từ ô B1 chứ không phải hằng số dự phòng.

Lưu ý một tác dụng phụ dễ gây hiểu nhầm: sau khi ghi vào `A1`, `usedRange` của sheet `Note` chuyển từ `Note!E4:K12` thành `Note!A1:K12`. Nghĩa là **mã cũ bị lỗi giờ cũng vô tình chạy đúng**. Đừng lấy đó làm bằng chứng rằng bản sửa hoạt động — bản sửa đúng vì nó không phụ thuộc vào việc ô A1 có nội dung hay không, và nếu sau này ai xoá A1 thì `readRange` vẫn đọc đúng còn `usedRange` thì không.

- [ ] **Bước 6: Deploy**

Chạy: `npm run deploy`
Kỳ vọng: deploy thành công, in ra URL Worker

- [ ] **Bước 7: Kiểm chứng đầu-cuối trên file gốc**

Chạy: `npm run verify:card`
Kỳ vọng: `SACH` — tất cả 6 mục PASS

Nếu có mục FAIL thì **dừng**, không đi tiếp, báo lại kèm nguyên văn output.

- [ ] **Bước 8: Kiểm chứng thủ công qua Telegram**

Gửi lần lượt và đối chiếu:

| Gửi | Kỳ vọng |
|---|---|
| `/help` | Có mục "Thẻ tín dụng", có dòng "Chốt sao kê ngày 7", mục mã viết tắt hiện `WM = Winmart · TC = TocoToco · MT = Mầm Trà · VM = V-mart` |
| `/other TC 15k` | Mô tả trong file là `TocoToco`, không phải `TC` |
| `/undo` | Xoá được khoản vừa ghi |
| `/food ăn trưa 20k 3/8 cc` | Có dòng `💳 trả tháng 8`, nhãn `(T8)` |
| `/undo` | Xoá được |
| `/food ăn trưa 20k 10/8 cc` | Có dòng `💳 tiêu 10/08 → trả tháng 9`, nhãn `(T9)`, `Tổng chi T9` |
| `/undo` | Xoá được |
| `/income lương 20tr cc` | Từ chối, câu lỗi có chữ `cc` |
| `/other nạp thẻ 30k` | **Không** có dòng `💳`, mô tả là `nạp thẻ` |
| `/undo` | Xoá được |

- [ ] **Bước 9: Bổ sung README**

Thêm vào `README.md`, ngay sau phần mô tả cú pháp:

```markdown
### Quẹt thẻ tín dụng

Thêm `cc` vào tin nhắn: `/food ăn trưa 40k cc`

Khoản quẹt thẻ được ghi vào tháng **tiền rời tài khoản**, không phải tháng tiêu.
Kỳ sao kê đóng vào hết ngày ghi ở ô `Note!B1` (mặc định 7), nên khoản quẹt từ
ngày 8 trở đi rơi sang tháng sau. Ngày trong cột `Ngày` vẫn là ngày tiêu thật —
thấy `10-Aug` trong sheet `Tháng 9` nghĩa là khoản thẻ chuyển sang.

Đổi mốc chốt: sửa ô `Note!B1` trong Excel, không cần deploy lại.

`cc` chỉ dùng cho 6 nhóm chi tiêu, không dùng với `/income`, `/invest`, `/saving`.
```

- [ ] **Bước 10: Commit**

```bash
git add scripts/setup-note.mjs scripts/verify-card.mjs package.json README.md
git commit -m "chore: script dat o cau hinh va kiem chung khoan the tren file goc"
```

---

## Sau khi xong

**REQUIRED SUB-SKILL:** Dùng superpowers:finishing-a-development-branch để chốt nhánh `feat/credit-card-timing`.
