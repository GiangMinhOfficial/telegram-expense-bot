# Gom tin nhắn xác nhận về một phạm vi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ba dòng trong tin nhắn xác nhận cùng nói về nhóm vừa ghi — khoản này, nhóm này trong ngày, nhóm này trong tháng thanh toán.

**Architecture:** Thêm một hàm định vị khối của một nhóm trong sheet tháng (`findBlock`), dùng chung cho hai việc: cộng các khoản của nhóm trong một ngày, và đọc tổng tháng ở chân bảng. Đổi `Totals` từ ba trường trộn phạm vi thành hai trường cùng phạm vi, rồi dựng lại ba dòng trong `confirmation`.

**Tech Stack:** TypeScript 7 (`strict`, `noUncheckedIndexedAccess`), Cloudflare Workers, Vitest, Microsoft Graph Workbook API.

**Spec:** `docs/superpowers/specs/2026-08-10-confirmation-layout-design.md`

## Global Constraints

- Không đổi bất cứ thứ gì bot GHI vào file. Dòng dữ liệu trước và sau plan này phải giống hệt nhau.
- Nhãn dòng 1 là tên ngắn; nhãn dòng 3 là tên ngắn cộng `T<tháng thanh toán>`; nhãn dòng 2 là `Hôm nay` khi ghi hôm nay, `Ngày dd/mm` khi ghi lùi ngày.
- Tên ngắn, đúng từng chữ: `food` → `Ăn uống` · `eat_out` → `Ăn ngoài` · `transport` → `Di chuyển` · `force` → `Bắt buộc` · `other` → `Linh tinh` · `other_expense` → `Chi khác` · `income` → `Thu nhập` · `invest` → `Đầu tư` · `saving` → `Tiết kiệm`
- Dòng 3 theo **tháng thanh toán** (`targetMonth`), không phải tháng phát sinh.
- Dòng tiêu đề `✅ …` và dòng `💳 …` giữ nguyên từng ký tự.
- `/today`, `/thang`, `/undo`, `/help`, và `carryOverRefusal` không đổi.
- `npm run typecheck` bao gồm cả `tests/**/*.ts`. Mọi task phải kết thúc với typecheck sạch và toàn bộ test xanh.
- Comment và tên test viết tiếng Việt, theo đúng văn phong file hiện có.

**Điều kiện tiên quyết:** working tree đang có bản sửa chưa commit trong `src/graph/sheet.ts`, `src/graph/totals.ts`, `tests/totals.test.ts` (đọc tổng nhóm từ chân bảng cho `/invest` và `/saving`). Commit nó trước khi bắt đầu Task 1 — plan này xây tiếp lên trên nó. Đừng commit `docs/SETUP.md`, đó là thay đổi của người dùng.

---

## File Structure

| File | Trách nhiệm sau plan |
|---|---|
| `src/graph/sheet.ts` | hằng bố cục sheet — không đổi trong plan này |
| `src/graph/totals.ts` | định vị khối của một nhóm, cộng theo ngày, đọc tổng tháng |
| `src/config.ts` | bảng 9 nhóm, thêm tên ngắn |
| `src/telegram/format.ts` | dựng chuỗi tin nhắn |
| `src/handlers/write.ts` | nối các mảnh lại: ghi, đọc, gửi |
| `tests/totals.test.ts` | test của tầng đọc số |
| `tests/format.test.ts` | test của tầng dựng chuỗi |

---

## Task 1: Lấy được tổng của một nhóm trong một ngày

Thêm `findBlock` và `sumCategoryDay` vào `totals.ts`, và thêm trường `categoryDay` vào `Totals`. Task này **chỉ thêm**, không xoá gì — `today` và `monthSpend` vẫn còn để `format.ts` và `write.ts` chưa phải đổi. Task 2 mới dọn.

**Files:**
- Modify: `src/graph/totals.ts`
- Test: `tests/totals.test.ts`
- Modify: `tests/format.test.ts` (chỉ hai literal `Totals`, để typecheck xanh)

**Interfaces:**
- Consumes: từ `src/graph/sheet.ts` — `ALL_BLOCKS: readonly [0, 4, 8]`, `BLOCK_HEADER: 'Mô tả chi tiêu'`, `BLOCK_FOOTER: 'Tổng cộng'`, `LABEL_COL: 12`, `VALUE_COL: 13`, `cellAt(row: unknown[], absCol: number, offset: number): unknown`, `colOffset(address: string): number`, `num(v: unknown): number | null`, `text(v: unknown): string`, `interface SheetData { address: string; values: unknown[][] }`
- Produces: `sumCategoryDay(sheet: SheetData, categoryLabel: string, daySerial: number): number` và trường `categoryDay: number` trong `Totals`. Task 2 dùng cả hai.

- [ ] **Step 1: Bổ sung fixture cho khối cột E**

Khối cột E trong fixture hiện chưa có dòng tiêu đề và dòng `Tổng cộng`, nên không dùng để kiểm `findBlock` được. Trong `tests/totals.test.ts`, sửa ba dòng r1, r2, r7 của `sheet.values` thành:

```ts
    /* r1  */ row({ 0: 'Ăn uống sinh hoạt', 4: 'Linh tinh', 8: 'Thu nhập', 12: 'Phân loại', 13: 'Số tiền' }),
    /* r2  */ row({ 0: 'Mô tả chi tiêu', 1: 'Ngày', 2: 'số tiền', 4: 'Mô tả chi tiêu', 5: 'Ngày', 6: 'số tiền', 8: 'Mô tả chi tiêu', 9: 'Ngày', 10: 'số tiền', 12: 'Ăn uống sinh hoạt', 13: 890_000 }),
```

```ts
    /* r7  */ row({ 4: 'Tổng cộng', 6: 37_000, 12: 'Ăn ngoài', 13: 170_000 }),
```

Các dòng còn lại giữ nguyên. Ô ngày của r2 và r7 ở cột E là chuỗi hoặc rỗng nên `num` trả `null` — các test `sumDay` cũ vẫn ra 77.000đ.

- [ ] **Step 2: Viết test đỏ**

Thêm vào cuối `tests/totals.test.ts`, trước `describe('sumDay')`:

```ts
describe('sumCategoryDay', () => {
  it('chỉ cộng khoản của đúng nhóm, không cộng nhóm khác cùng ngày', () =>
    // Cùng ngày T còn có bạc xỉu 20.000 và xúc xích 17.000 ở khối Linh tinh.
    expect(sumCategoryDay(sheet, 'Ăn uống sinh hoạt', T)).toBe(40_000));

  it('cộng dồn nhiều khoản của cùng nhóm trong một ngày', () =>
    expect(sumCategoryDay(sheet, 'Linh tinh', T)).toBe(37_000));

  it('ngày khác cho tổng khác — dùng cho ghi lùi ngày', () =>
    expect(sumCategoryDay(sheet, 'Ăn uống sinh hoạt', 46_241)).toBe(35_000));

  it('nhóm ở cột I cũng đọc được', () =>
    expect(sumCategoryDay(sheet, 'Đầu tư', T)).toBe(3_300_000));

  it('khối rỗng → 0', () =>
    expect(sumCategoryDay(sheet, 'Tiết kiệm', T)).toBe(0));

  it('nhóm không có khối nào → 0', () =>
    expect(sumCategoryDay(sheet, 'Không tồn tại', T)).toBe(0));

  it('ngày không có khoản nào của nhóm → 0', () =>
    expect(sumCategoryDay(sheet, 'Ăn uống sinh hoạt', 46_000)).toBe(0));

  it('không vớ sang khối phía dưới trong cùng cột', () =>
    // Thu nhập kết thúc ở dòng Tổng cộng r9; CCQ 3.300.000 của Đầu tư nằm dưới.
    expect(sumCategoryDay(sheet, 'Thu nhập', T)).toBe(3_000_000));

  it('vùng bắt đầu từ cột I vẫn định vị đúng khối', () => {
    const fromI = {
      address: 'Tháng 8!I1:O16',
      values: sheet.values.map((r) => r.slice(8)),
    };
    expect(sumCategoryDay(fromI, 'Đầu tư', T)).toBe(3_300_000);
  });
});

describe('computeTotals.categoryDay', () => {
  it('bằng tổng của nhóm trong ngày, không phải tổng chi cả ngày', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).categoryDay).toBe(40_000));

  it('nhóm không tiêu gì trong ngày → 0', () =>
    expect(computeTotals(sheet, 'Đầu tư', 46_241).categoryDay).toBe(0));
});
```

Sửa dòng `import` đầu file thành:

```ts
import { computeTotals, sumCategoryDay, sumDay } from '../src/graph/totals';
```

- [ ] **Step 3: Chạy test để chắc chắn nó đỏ**

Run: `npx vitest run tests/totals.test.ts`
Expected: FAIL — `sumCategoryDay is not a function` và `categoryDay` là `undefined`.

- [ ] **Step 4: Thêm `findBlock` và `sumCategoryDay`**

Trong `src/graph/totals.ts`, thay toàn bộ hàm `blockTotal` (từ dòng comment `/**` mở đầu nó đến dấu `}` đóng) bằng khối sau:

```ts
interface Block {
  /** Chỉ số cột TUYỆT ĐỐI của cột mô tả */
  col: number;
  /** Các dòng khoản chi, không gồm dòng tiêu đề và dòng Tổng cộng */
  rows: unknown[][];
  /** Giá trị ở dòng Tổng cộng, `null` nếu khối không có dòng đó */
  footerTotal: number | null;
}

/**
 * Định vị khối của một nhóm trong sheet tháng.
 *
 * Mọi khối có cùng hình dạng: ô tiêu đề mang tên nhóm, ngay dưới là dòng
 * "Mô tả chi tiêu", rồi các khoản, rồi "Tổng cộng". Trong mỗi khối, cột tiêu đề
 * là mô tả, lệch phải 1 là ngày, lệch phải 2 là số tiền.
 *
 * Gặp dòng "Mô tả chi tiêu" lần thứ hai nghĩa là đã lọt sang khối kế tiếp trong
 * cùng cột — dừng lại và bỏ `footerTotal`. Cột I chứa ba khối nối đuôi nhau nên
 * không có chốt này thì một khối thiếu dòng Tổng cộng sẽ lấy tổng của nhóm bên
 * dưới. Thà không có số còn hơn báo tiền của nhóm khác.
 */
function findBlock(sheet: SheetData, categoryLabel: string, off: number): Block | null {
  for (const col of ALL_BLOCKS) {
    const rows: unknown[][] = [];
    let inBlock = false;
    let seenHeader = false;

    for (const row of sheet.values) {
      const t = text(cellAt(row, col, off));
      if (!inBlock) {
        inBlock = t === categoryLabel;
        continue;
      }
      if (t === BLOCK_FOOTER) {
        return { col, rows, footerTotal: num(cellAt(row, col + 2, off)) };
      }
      if (t === BLOCK_HEADER) {
        if (seenHeader) return { col, rows, footerTotal: null };
        seenHeader = true;
        continue;
      }
      rows.push(row);
    }
    if (inBlock) return { col, rows, footerTotal: null };
  }
  return null;
}

/** Tổng các khoản của một nhóm trong một ngày, trên MỘT sheet. */
export function sumCategoryDay(
  sheet: SheetData, categoryLabel: string, daySerial: number,
): number {
  const off = colOffset(sheet.address);
  const block = findBlock(sheet, categoryLabel, off);
  return block ? sumBlockDay(block, off, daySerial) : 0;
}

function sumBlockDay(block: Block, off: number, daySerial: number): number {
  let total = 0;
  for (const row of block.rows) {
    if (num(cellAt(row, block.col + 1, off)) !== daySerial) continue;
    total += num(cellAt(row, block.col + 2, off)) ?? 0;
  }
  return total;
}
```

- [ ] **Step 5: Thêm `categoryDay` vào `Totals` và `computeTotals`**

Trong cùng file, thêm trường vào interface:

```ts
export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng ĐÍCH */
  categoryMonth: number;
  /** Tổng nhóm vừa ghi, trong ngày ghi nhận */
  categoryDay: number;
  /** Tổng chi của `daySerial` (không gồm thu nhập / đầu tư / tiết kiệm) */
  today: number;
  /** Tổng chi cả tháng ĐÍCH */
  monthSpend: number;
}
```

Và thay phần thân `computeTotals` — từ `const off = colOffset(sheet.address);` đến hết hàm — bằng:

```ts
  const off = colOffset(sheet.address);
  const block = findBlock(sheet, categoryLabel, off);
  let categoryMonth: number | null = null;
  let monthSpend = 0;

  for (const row of sheet.values) {
    const label = text(cellAt(row, LABEL_COL, off));
    if (!label) continue;
    const v = num(cellAt(row, VALUE_COL, off));
    if (v === null) continue;
    if (label === categoryLabel) categoryMonth = v;
    else if (label === TOTAL_LABEL) monthSpend = v;
  }

  return {
    categoryMonth: categoryMonth ?? block?.footerTotal ?? 0,
    categoryDay: block ? sumBlockDay(block, off, daySerial) : 0,
    today: sumDay(sheet, daySerial),
    monthSpend,
  };
```

- [ ] **Step 6: Vá hai literal `Totals` trong test dựng chuỗi**

`categoryDay` là trường bắt buộc nên hai literal trong `tests/format.test.ts` không còn hợp lệ. Sửa:

```ts
  const totals = { categoryMonth: 890_000, categoryDay: 40_000, today: 75_000, monthSpend: 3_240_000 };
```

```ts
const CARD_TOTALS = { categoryMonth: 215_000, categoryDay: 40_000, today: 117_000, monthSpend: 2_503_667 };
```

- [ ] **Step 7: Chạy toàn bộ test và typecheck**

Run: `npx vitest run` rồi `npm run typecheck`
Expected: mọi test PASS, typecheck không in lỗi.

- [ ] **Step 8: Commit**

```bash
git add src/graph/totals.ts tests/totals.test.ts tests/format.test.ts
git commit -m "feat: đọc tổng của một nhóm trong một ngày"
```

---

## Task 2: Dựng lại ba dòng và dọn phần thừa

Đổi `confirmation` sang bố cục mới, cho `write.ts` truyền tên ngắn và cộng dồn theo nhóm, rồi xoá những thứ thành mồ côi.

**Files:**
- Modify: `src/config.ts`
- Modify: `src/telegram/format.ts`
- Modify: `src/handlers/write.ts`
- Modify: `src/graph/totals.ts`
- Test: `tests/format.test.ts`
- Modify: `tests/totals.test.ts`

**Interfaces:**
- Consumes: từ Task 1 — `sumCategoryDay(sheet: SheetData, categoryLabel: string, daySerial: number): number`, trường `categoryDay: number` trong `Totals`.
- Produces: `Totals` rút còn `{ categoryMonth: number; categoryDay: number }`; `confirmation` nhận thêm trường `short: string` trong tham số thứ nhất; mỗi mục trong `CATEGORIES` có thêm `short: string`.

- [ ] **Step 1: Viết test đỏ cho bố cục ba dòng**

Trong `tests/format.test.ts`, thêm hàm đọc từng dòng ngay dưới dòng `import`:

```ts
/** Tách các dòng bên trong khối <pre> để kiểm từng nhãn một cách chính xác. */
const preLines = (html: string): string[] => {
  const m = /<pre>([\s\S]*)<\/pre>/.exec(html);
  return (m?.[1] ?? '').split('\n');
};
```

Thay toàn bộ `describe('confirmation', …)` (dòng 9 đến 41 của file hiện tại) bằng:

```ts
describe('confirmation', () => {
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt', short: 'Ăn uống',
    isCard: false, targetMonth: 8,
  };
  const totals = { categoryMonth: 890_000, categoryDay: 75_000 };
  const html = confirmation(entry, totals, true);

  it('có dòng xác nhận đủ 4 mảnh thông tin', () => {
    expect(html).toContain('cơm trưa');
    expect(html).toContain('40.000đ');
    expect(html).toContain('08/08');
    expect(html).toContain('Ăn uống sinh hoạt');
  });

  it('dòng 1 là tên ngắn và số tiền khoản vừa ghi', () =>
    expect(preLines(html)[0]).toMatch(/^Ăn uống\s+40\.000đ$/));

  it('dòng 2 là tổng của nhóm trong ngày', () =>
    expect(preLines(html)[1]).toMatch(/^Hôm nay\s+75\.000đ$/));

  it('dòng 3 là tổng của nhóm cả tháng, nhãn kèm số tháng', () =>
    expect(preLines(html)[2]).toMatch(/^Ăn uống T8\s+890\.000đ$/));

  it('đúng ba dòng, không thừa', () =>
    expect(preLines(html)).toHaveLength(3));

  it('không còn nhãn nói về toàn bộ chi tiêu', () =>
    expect(html).not.toContain('Tổng chi'));

  it('dùng khối <pre> để các con số thẳng cột', () => expect(html).toContain('<pre>'));

  it('ghi lùi ngày → nhãn dòng 2 là ngày đó, không phải "Hôm nay"', () => {
    const back = confirmation({ ...entry, date: { y: 2026, m: 8, d: 5 } }, totals, false);
    expect(preLines(back)[1]).toMatch(/^Ngày 05\/08\s+75\.000đ$/);
    expect(back).not.toContain('Hôm nay');
  });

  it('thoát ký tự HTML trong mô tả', () =>
    expect(confirmation({ ...entry, description: 'cơm <b>ngon</b>' }, totals, true))
      .toContain('&lt;b&gt;'));
});
```

Thay `CARD_TOTALS` và `card` (dòng 43 đến 47 hiện tại) bằng:

```ts
const CARD_TOTALS = { categoryMonth: 215_000, categoryDay: 117_000 };
const card = {
  description: 'cơm trưa', amount: 40_000,
  date: { y: 2026, m: 8, d: 10 }, label: 'Ăn uống sinh hoạt', short: 'Ăn uống',
};
```

Trong `describe('confirmation với khoản thẻ', …)`, thay hai test nhãn (`'nhãn nhóm mang THÁNG ĐÍCH…'` và `'nhãn tổng chi cũng mang THÁNG ĐÍCH'`) bằng:

```ts
  it('nhãn dòng 3 mang THÁNG ĐÍCH, không mang tháng phát sinh', () => {
    const s = confirmation({ ...card, isCard: true, targetMonth: 9 }, CARD_TOTALS, false);
    expect(preLines(s)[2]).toMatch(/^Ăn uống T9\s+215\.000đ$/);
    expect(s).not.toContain('Ăn uống T8');
  });
```

Và thay hai test cuối (`'ghi hôm nay thì dòng giữa ghi "Hôm nay"'`, `'ghi lùi ngày thì dòng giữa mang ngày đó'`) bằng:

```ts
  it('ghi hôm nay thì dòng 2 ghi "Hôm nay"', () => {
    const s = confirmation({ ...card, isCard: false, targetMonth: 8 }, CARD_TOTALS, true);
    expect(preLines(s)[1]).toMatch(/^Hôm nay\s+117\.000đ$/);
  });

  it('ghi lùi ngày thì dòng 2 mang ngày đó', () => {
    const s = confirmation({ ...card, isCard: false, targetMonth: 8 }, CARD_TOTALS, false);
    expect(preLines(s)[1]).toMatch(/^Ngày 10\/08\s+117\.000đ$/);
  });
```

Ba test còn lại của khối thẻ (`'tiền mặt không có dòng thẻ'`, `'thẻ không nhảy tháng'`, `'thẻ nhảy tháng nói rõ cả ngày tiêu lẫn tháng trả'`) giữ nguyên.

- [ ] **Step 2: Chạy test để chắc chắn nó đỏ**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — dòng 1 vẫn là `Ăn uống sinh hoạt (T8)` với 890.000đ chứ không phải `Ăn uống` với 40.000đ, và khối vẫn chứa `Tổng chi`.

- [ ] **Step 3: Thêm tên ngắn vào bảng nhóm**

Thay `CATEGORIES` trong `src/config.ts` bằng:

```ts
export const CATEGORIES = {
  food:          { table: 'food',          label: 'Ăn uống sinh hoạt',     short: 'Ăn uống' },
  eat_out:       { table: 'eat_out',       label: 'Ăn ngoài',              short: 'Ăn ngoài' },
  transport:     { table: 'transport',     label: 'Phương tiện di chuyển', short: 'Di chuyển' },
  force:         { table: 'force',         label: 'Chi tiêu bắt buộc',     short: 'Bắt buộc' },
  other:         { table: 'other',         label: 'Linh tinh',             short: 'Linh tinh' },
  other_expense: { table: 'other_expense', label: 'Chi tiêu khác',         short: 'Chi khác' },
  income:        { table: 'income',        label: 'Thu nhập',              short: 'Thu nhập' },
  invest:        { table: 'invest',        label: 'Đầu tư',                short: 'Đầu tư' },
  saving:        { table: 'saving',        label: 'Tiết kiệm',             short: 'Tiết kiệm' },
} as const;
```

Comment `/** 9 lệnh ghi. Khoá = lệnh (không có dấu /). Nguồn: sheet Note cột J–K. */` phía trên giữ nguyên.

- [ ] **Step 4: Dựng lại ba dòng trong `confirmation`**

Trong `src/telegram/format.ts`, thay toàn bộ hàm `confirmation` bằng:

```ts
export function confirmation(
  e: {
    description: string; amount: number; date: VNDate; label: string; short: string;
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

  // Cả ba dòng cùng nói về nhóm vừa ghi: khoản này → ngày ghi nhận → tháng
  // thanh toán. Trộn phạm vi là lý do "Hôm nay" từng bị đọc nhầm thành tính sót.
  const body = alignedRows([
    [e.short, formatVND(e.amount)],
    [isToday ? 'Hôm nay' : `Ngày ${dm(e.date)}`, formatVND(t.categoryDay)],
    [`${e.short} T${e.targetMonth}`, formatVND(t.categoryMonth)],
  ]);
  return `${head.join('\n')}\n\n<pre>${esc(body)}</pre>`;
}
```

- [ ] **Step 5: Cho `write.ts` truyền tên ngắn và cộng dồn theo nhóm**

Trong `src/handlers/write.ts`, thay dòng import từ `'../graph/totals'`:

```ts
import { computeTotals, sumCategoryDay } from '../graph/totals';
```

Thay đoạn từ `const label = CATEGORIES[e.category].label;` đến hết hàm bằng:

```ts
  const cat = CATEGORIES[e.category];
  // Tổng theo ngày CỦA KHOẢN VỪA GHI, không phải hôm nay — để con số hiện ra
  // luôn chứa khoản vừa ghi, kể cả khi ghi lùi ngày.
  const totals = computeTotals(dest, cat.label, serial);
  if (origin) totals.categoryDay += sumCategoryDay(origin, cat.label, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(
    env, chatId,
    confirmation({ ...e, label: cat.label, short: cat.short }, totals, isToday),
  );
}
```

- [ ] **Step 6: Xoá phần đã thành mồ côi**

Trong `src/graph/totals.ts`:

Rút `Totals` còn hai trường:

```ts
export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng ĐÍCH */
  categoryMonth: number;
  /** Tổng nhóm vừa ghi, trong ngày ghi nhận */
  categoryDay: number;
}
```

Xoá hằng `const TOTAL_LABEL = 'Tổng chi';` và xoá toàn bộ hàm `sumDay` cùng comment của nó.

Thay thân `computeTotals` bằng:

```ts
  const off = colOffset(sheet.address);
  const block = findBlock(sheet, categoryLabel, off);
  let categoryMonth: number | null = null;

  for (const row of sheet.values) {
    if (text(cellAt(row, LABEL_COL, off)) !== categoryLabel) continue;
    const v = num(cellAt(row, VALUE_COL, off));
    if (v !== null) { categoryMonth = v; break; }
  }

  return {
    // Đầu tư và Tiết kiệm không có dòng nào trong bảng M:N — lấy từ chân bảng.
    categoryMonth: categoryMonth ?? block?.footerTotal ?? 0,
    categoryDay: block ? sumBlockDay(block, off, daySerial) : 0,
  };
```

Rút dòng import đầu file — `SPEND_BLOCKS` chỉ còn `handlers/query.ts` dùng, `totals.ts` không cần nữa:

```ts
import {
  ALL_BLOCKS, BLOCK_FOOTER, BLOCK_HEADER, LABEL_COL, type SheetData,
  VALUE_COL, cellAt, colOffset, num, text,
} from './sheet';
```

Trong `tests/totals.test.ts`, xoá `describe('sumDay', …)` ở cuối file và xoá `sumDay` khỏi dòng import.

**Chỉ trong `describe('computeTotals', …)`**, xoá sáu test đã mất đối tượng vì chúng kiểm `today` hoặc `monthSpend`:

- `'lấy Tổng chi từ bảng M:O'`
- `'cộng đúng các khoản chi hôm nay từ khối A:C và E:G'`
- `'KHÔNG tính khối I:K vào chi hôm nay'`
- `'bỏ qua dòng Tổng cộng vì ô ngày trống'`
- `'ngày khác cho tổng khác — dùng cho ghi lùi ngày'`
- `'khối Đầu tư không lọt vào tổng chi trong ngày'`

Cẩn thận: `describe('sumCategoryDay', …)` do Task 1 thêm cũng có một test tên `'ngày khác cho tổng khác — dùng cho ghi lùi ngày'`. Test đó PHẢI giữ — nó kiểm `sumCategoryDay`, không phải `today`.

Trong test `'sheet rỗng → tất cả 0'`, sửa giá trị mong đợi:

```ts
  it('sheet rỗng → tất cả 0', () =>
    expect(computeTotals({ address: 'Tháng 9!A1:A1', values: [] }, 'Ăn uống sinh hoạt', T))
      .toEqual({ categoryMonth: 0, categoryDay: 0 }));
```

Trong test `'vùng bắt đầu từ cột M vẫn đọc đúng bảng tổng hợp'`, thay ba dòng `expect` cuối bằng:

```ts
    const t = computeTotals(onlySummary, 'Ăn uống sinh hoạt', T);
    expect(t.categoryMonth).toBe(890_000);
    expect(t.categoryDay).toBe(0);
```

- [ ] **Step 7: Chạy toàn bộ test và typecheck**

Run: `npx vitest run` rồi `npm run typecheck`
Expected: mọi test PASS, typecheck không in lỗi. Nếu typecheck báo `monthSpend` hoặc `today` còn được dùng ở đâu đó, sửa chỗ đó — không được thêm lại trường.

- [ ] **Step 8: Dựng Worker để chắc chắn nó vẫn đóng gói được**

Run: `npx wrangler deploy --dry-run`
Expected: build thành công, in ra kích thước bundle.

- [ ] **Step 9: Commit**

```bash
git add src/config.ts src/telegram/format.ts src/handlers/write.ts src/graph/totals.ts tests/format.test.ts tests/totals.test.ts
git commit -m "feat: gom ba dòng xác nhận về một phạm vi"
```

---

## Task 3: Đối chiếu trên file thật

Test dùng fixture dựng tay. Task này kiểm rằng bố cục mới ra đúng số trên chính file OneDrive của người dùng — cùng cách đã bắt được lỗi `/invest` trả về 0đ.

**Files:**
- Create: `scripts/check-message.mjs`

**Interfaces:**
- Consumes: `scripts/lib/dev-vars.mjs` — `loadEnv(): Record<string, string>` và `getAccessToken(env): Promise<string>`.
- Produces: không có gì cho task sau. Đây là task cuối.

- [ ] **Step 1: Viết script chỉ đọc**

Tạo `scripts/check-message.mjs`:

```js
// Doc sheet thang tu file THAT roi in ba con so cua tung nhom. CHI DOC.
// Doi chieu bang mat voi file de chac chan bo cuc moi khong bia so.
import { getAccessToken, loadEnv } from './lib/dev-vars.mjs';

const MONTH = Number(process.argv[2] ?? new Date().getMonth() + 1);
const DAY_SERIAL = Number(process.argv[3] ?? 0);

const env = loadEnv();
const token = await getAccessToken(env);
const G = 'https://graph.microsoft.com/v1.0';
const sheet = `Tháng ${MONTH}`;
const url =
  `${G}/me/drive/items/${env.DRIVE_ITEM_ID}/workbook` +
  `/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`;

const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error('DOC SHEET THAT BAI:', res.status, (await res.text()).slice(0, 400));
  process.exit(1);
}
const data = await res.json();
console.log(`${sheet} — ${data.address}`);
console.log(JSON.stringify({ address: data.address, values: data.values }));
```

Thêm vào `scripts` trong `package.json`:

```json
    "check:message": "node scripts/check-message.mjs",
```

- [ ] **Step 2: Chạy thử để chắc chắn nó đọc được**

Run: `npm run check:message -- 8`
Expected: in ra `Tháng 8 — 'Tháng 8'!A1:O28` rồi một dòng JSON. Không ghi gì vào file.

- [ ] **Step 3: Dựng tin nhắn từ dữ liệu thật và đối chiếu**

Lưu dòng JSON ở Step 2 vào `thang8.json` ở gốc repo, rồi tạo tạm `tests/check-real.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { CATEGORIES } from '../src/config';
import type { SheetData } from '../src/graph/sheet';
import { computeTotals } from '../src/graph/totals';
import { confirmation } from '../src/telegram/format';

const sheet = JSON.parse(
  readFileSync(new URL('../thang8.json', import.meta.url), 'utf8'),
) as SheetData;

describe('doi chieu tren file that', () => {
  it('in tin nhan cho tung nhom', () => {
    for (const key of ['food', 'invest', 'saving', 'income'] as const) {
      const c = CATEGORIES[key];
      const t = computeTotals(sheet, c.label, 46_244);
      console.log(confirmation({
        description: 'thử', amount: 40_000,
        date: { y: 2026, m: 8, d: 10 }, label: c.label, short: c.short,
        isCard: false, targetMonth: 8,
      }, t, true));
    }
  });
});
```

Run: `npx vitest run tests/check-real.test.ts --silent=false --reporter=verbose`

Đối chiếu từng con số với file: dòng 2 phải bằng tổng các khoản của nhóm đó ghi ngày 10/08, dòng 3 phải bằng ô `Tổng cộng` ở chân bảng của nhóm (hoặc ô tương ứng trong bảng `M:N`). Nếu lệch một đồng thì dừng lại và tìm nguyên nhân, đừng sửa test cho khớp.

- [ ] **Step 4: Xoá file tạm**

```bash
rm tests/check-real.test.ts thang8.json
```

Chạy lại `npx vitest run` để chắc chắn không còn file lạ. `scripts/check-message.mjs` thì giữ — nó chỉ đọc và sẽ cần lại lần sau.

- [ ] **Step 5: Cập nhật README**

Trong `README.md`, tìm đoạn mô tả tin nhắn xác nhận và thay ví dụ bằng bố cục mới:

```
✅ cơm trưa · 40.000đ · 10/08 → Ăn uống sinh hoạt

Ăn uống        40.000đ
Hôm nay        55.000đ
Ăn uống T8    250.000đ
```

Kèm một câu: cả ba dòng đều nói về nhóm vừa ghi; muốn xem tổng chi mọi nhóm thì dùng `/today` và `/thang`.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-message.mjs package.json README.md
git commit -m "chore: script đối chiếu tin nhắn trên file thật"
```

---

## Self-Review

**Spec coverage**

| Mục spec | Task |
|---|---|
| §3 bố cục ba dòng | Task 2 Step 4 |
| §4 tên ngắn 9 nhóm | Task 2 Step 3 |
| §5 ví dụ, gồm ghi lùi ngày và thẻ nhảy tháng | Task 2 Step 1 (test), Task 3 Step 3 (file thật) |
| §6 `findBlock`, `sumCategoryDay`, quy tắc dừng | Task 1 Step 4 |
| §6 dòng 3 vẫn tra bảng `M:N` trước | Task 2 Step 6 |
| §7 bảng thay đổi từng file | Task 1 Step 4–5, Task 2 Step 3–6 |
| §7 xoá `monthSpend`, `TOTAL_LABEL`, `sumDay` | Task 2 Step 6 |
| §8 không đổi những gì bot ghi | Global Constraints; Task 2 không đụng `appendRow` |
| §9 danh sách test | Task 1 Step 2, Task 2 Step 1 |
| §9 đối chiếu trên snapshot thật | Task 3 |
| §11 phụ thuộc bản sửa chưa commit | Điều kiện tiên quyết |

**Placeholder scan:** không có "TBD", "TODO", "xử lý các trường hợp biên", hay bước nào mô tả mà không kèm code.

**Type consistency:** `sumCategoryDay(sheet, categoryLabel, daySerial)` khai ở Task 1 Step 4, dùng đúng tên và đúng thứ tự tham số ở Task 2 Step 5. `Block` có ba trường `col`/`rows`/`footerTotal`, dùng đúng ở `sumBlockDay` và ở `computeTotals`. `short` thêm vào `CATEGORIES` ở Task 2 Step 3, đọc ở Step 5 qua `cat.short`, khai trong kiểu tham số của `confirmation` ở Step 4.

**Một điểm đã sửa khi tự soát:** bản nháp đầu để Task 1 xoá luôn `today` và `monthSpend`, làm `format.ts` và `write.ts` gãy ngay tại ranh giới task — typecheck đỏ giữa chừng. Đã tách: Task 1 chỉ thêm, Task 2 mới dọn.
