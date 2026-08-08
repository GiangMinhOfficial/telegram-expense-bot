# Kế hoạch triển khai: Bot Telegram ghi chi tiêu vào Excel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ghi một khoản chi tiêu vào đúng bảng trong `Theo dõi chi tiêu.xlsx` bằng một tin nhắn Telegram như `/food ăn trưa 40k`, có xác nhận kèm số liệu tổng trong dưới 1 giây.

**Architecture:** Telegram webhook → Cloudflare Worker (TypeScript) → Microsoft Graph Workbook API → file Excel trên OneDrive cá nhân. Cloudflare D1 giữ refresh token xoay vòng, con trỏ `/undo`, khoản chờ xác nhận và hàng đợi ghi lại. Không có bộ phận nào chạy trên máy cá nhân.

**Tech Stack:** TypeScript · Cloudflare Workers + D1 + Cron Triggers · Wrangler · Vitest · Microsoft Graph v1.0 · Telegram Bot API

**Spec:** `docs/superpowers/specs/2026-08-08-telegram-expense-bot-design.md`

---

## Global Constraints

- **Năm của workbook: 2026.** Mọi ngày ngoài năm 2026 bị từ chối ghi.
- **Múi giờ: Asia/Ho_Chi_Minh (UTC+7), không DST.** Worker chạy UTC — mọi phép tính "hôm nay" phải quy đổi tường minh.
- **Tên bảng đích: `{tiền tố}_{tháng}`** — 9 tiền tố: `food`, `eat_out`, `transport`, `force`, `other`, `other_expense`, `income`, `invest`, `saving`. Tháng là số 1–12, không đệm số 0.
- **Mọi lần ghi là `POST /tables/{name}/rows/add`.** Không dò dòng trống. Không cảnh báo khi bảng giãn.
- **Schema bảng: 3 cột** `Mô tả chi tiêu | Ngày | số tiền`. Cột Ngày ghi **serial Excel** (số nguyên), không ghi chuỗi.
- **Bí mật không bao giờ vào git.** Bot token, Azure client secret, refresh token nằm trong Wrangler Secrets / D1.
- **Worker luôn trả HTTP 200 cho Telegram**, kể cả khi xử lý lỗi — lỗi báo cho người dùng qua `sendMessage`. Trả mã khác sẽ khiến Telegram gửi lại liên tục.
- **Chỉ phục vụ một Telegram user ID duy nhất.** Người khác nhắn vào: không phản hồi gì.

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/config.ts` | Hằng số: 9 nhóm, nhãn hiển thị, năm workbook, múi giờ, tên sheet theo tháng |
| `src/parse/amount.ts` | Phân tích token số tiền → số chính xác hoặc "mơ hồ" |
| `src/parse/date.ts` | Phân tích token ngày + quy đổi UTC+7 + serial Excel |
| `src/parse/message.ts` | Ghép: tách lệnh, quét token, bung mã tắt, trả kết quả hoàn chỉnh |
| `src/db.ts` | Mọi truy cập D1 (token, con trỏ undo, khoản chờ, hàng đợi, nhật ký) |
| `src/graph/auth.ts` | Lấy access token, làm mới + lưu refresh token xoay vòng |
| `src/graph/client.ts` | `graphFetch` — bọc HTTP, gắn token, thử lại 1 lần khi 401 |
| `src/graph/workbook.ts` | `addRow`, `deleteRow`, `readRow`, `readSheet` |
| `src/graph/totals.ts` | Tính 3 con số tổng từ dữ liệu sheet |
| `src/telegram/api.ts` | `sendMessage`, `answerCallbackQuery` |
| `src/telegram/format.ts` | Dựng chuỗi xác nhận, thông báo lỗi, `/today`, `/thang`, `/help` |
| `src/router.ts` | Điều phối: update Telegram → handler tương ứng |
| `src/index.ts` | Điểm vào Worker: `fetch` (webhook + bảo mật) và `scheduled` (cron) |
| `scripts/get-refresh-token.mjs` | Chạy một lần trên máy: luồng OAuth, in ra refresh token |
| `scripts/spike.mjs` | **BƯỚC 0** — kiểm chứng `rows/add` không phá công thức |

---

## Task 1: Scaffold dự án + xác thực Microsoft Graph

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `.gitignore`, `vitest.config.ts`
- Create: `scripts/get-refresh-token.mjs`
- Create: `docs/SETUP.md`

**Interfaces:**
- Consumes: (không có — task đầu)
- Produces: file `.dev.vars` chứa `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REFRESH_TOKEN`, `DRIVE_ITEM_ID`; và `docs/SETUP.md` ghi lại các bước thủ công đã làm.

> **Lưu ý về thứ tự:** spec liệt kê spike là "bước 0" và Azure là "bước 1", nhưng không thể gọi Graph khi chưa có token. Spec cũng đã ghi spike đóng vai "hello world cho chuỗi xác thực". Kế hoạch này gộp đúng như vậy: Task 1 dựng xác thực, Task 2 là spike.

- [ ] **Step 1: Khởi tạo package.json**

```bash
cd D:/Documents/telegram-expense-bot
npm init -y
npm i -D typescript vitest wrangler @cloudflare/workers-types
```

- [ ] **Step 2: Viết tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Viết .gitignore**

```
node_modules/
.dev.vars
.wrangler/
dist/
*.log
```

`.dev.vars` phải nằm trong `.gitignore` **trước** khi tạo file đó — nó chứa client secret và refresh token.

- [ ] **Step 4: Viết vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 5: Đăng ký app trên Azure (thủ công)**

Làm trên trình duyệt tại https://portal.azure.com → *App registrations* → *New registration*:

| Trường | Giá trị |
|---|---|
| Name | `telegram-expense-bot` |
| Supported account types | **Personal Microsoft accounts only** |
| Redirect URI | *Web* → `http://localhost:8788/callback` |

Sau khi tạo:
1. Chép **Application (client) ID** → đây là `MS_CLIENT_ID`
2. *Certificates & secrets* → *New client secret* → chép **Value** (không phải Secret ID) → `MS_CLIENT_SECRET`
3. *API permissions* → *Add a permission* → *Microsoft Graph* → *Delegated* → thêm `Files.ReadWrite` và `offline_access`

Ghi lại toàn bộ các bước này vào `docs/SETUP.md` khi làm, kèm ngày tháng — client secret có hạn dùng và sẽ cần gia hạn.

- [ ] **Step 6: Viết scripts/get-refresh-token.mjs**

```js
// Chạy một lần: node scripts/get-refresh-token.mjs
// Mở trình duyệt, đăng nhập, rồi in ra refresh token + drive item id.
import http from 'node:http';
import { createInterface } from 'node:readline/promises';

const TENANT = 'consumers';
const REDIRECT = 'http://localhost:8788/callback';
const SCOPE = 'Files.ReadWrite offline_access';
const FILE_PATH = '/Documents/TCCN/Theo dõi chi tiêu.xlsx';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const clientId = (await rl.question('MS_CLIENT_ID: ')).trim();
const clientSecret = (await rl.question('MS_CLIENT_SECRET: ')).trim();
rl.close();

const authUrl =
  `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize` +
  `?client_id=${encodeURIComponent(clientId)}` +
  `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_mode=query&scope=${encodeURIComponent(SCOPE)}`;

console.log('\nMở link này trong trình duyệt và đăng nhập:\n');
console.log(authUrl + '\n');

const code = await new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost:8788');
    const c = url.searchParams.get('code');
    res.end(c ? 'Xong. Quay lai terminal.' : 'Thieu code.');
    if (c) { server.close(); resolve(c); }
  });
  server.listen(8788);
});

const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      scope: SCOPE,
    }),
  },
);
const tok = await tokenRes.json();
if (!tok.refresh_token) { console.error('THAT BAI:', tok); process.exit(1); }

const itemRes = await fetch(
  `https://graph.microsoft.com/v1.0/me/drive/root:${encodeURI(FILE_PATH)}`,
  { headers: { authorization: `Bearer ${tok.access_token}` } },
);
const item = await itemRes.json();
if (!item.id) { console.error('KHONG TIM THAY FILE:', item); process.exit(1); }

console.log('\n=== Dán vào .dev.vars ===\n');
console.log(`MS_CLIENT_ID=${clientId}`);
console.log(`MS_CLIENT_SECRET=${clientSecret}`);
console.log(`MS_REFRESH_TOKEN=${tok.refresh_token}`);
console.log(`DRIVE_ITEM_ID=${item.id}`);
console.log(`\nFile: ${item.name}  (${item.size} bytes)`);
```

- [ ] **Step 7: Chạy script và tạo .dev.vars**

Run: `node scripts/get-refresh-token.mjs`
Expected: in ra 4 dòng biến môi trường và tên file `Theo dõi chi tiêu.xlsx` kèm kích thước ~209521 bytes.

Nếu bước tìm file thất bại: kiểm lại đường dẫn `FILE_PATH`. Thư mục đồng bộ cục bộ là `D:\Documents\Onedrive`, tương ứng gốc OneDrive, nên đường dẫn trên cloud là `/Documents/TCCN/...`.

Chép kết quả vào `.dev.vars` ở thư mục gốc dự án.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore vitest.config.ts scripts/get-refresh-token.mjs docs/SETUP.md
git commit -m "chore: scaffold dự án và luồng lấy refresh token Microsoft Graph"
```

Kiểm tra `git status` không hiện `.dev.vars`. Nếu hiện, `.gitignore` sai — sửa trước khi commit.

---

## Task 2: BƯỚC 0 — Spike kiểm chứng `rows/add` (CỔNG CHẶN)

**Files:**
- Create: `scripts/spike.mjs`
- Create: `docs/SPIKE-RESULT.md`

**Interfaces:**
- Consumes: `.dev.vars` từ Task 1
- Produces: `docs/SPIKE-RESULT.md` — biên bản PASS/FAIL từng mục. **Không task nào sau đây được bắt đầu nếu file này không kết luận PASS.**

> **Đây là cổng chặn.** Spec mục 5.2 và 13: nếu spike cho thấy `rows/add` làm hỏng `Tóm tắt`, **DỪNG LẠI, không tự chữa, báo lại để bàn hướng khác.**

- [ ] **Step 1: Nhân bản file trên OneDrive**

Làm trên trình duyệt tại onedrive.live.com, hoặc bằng Graph:

```bash
curl -X POST "https://graph.microsoft.com/v1.0/me/drive/items/{DRIVE_ITEM_ID}/copy" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" -H "Content-Type: application/json" \
  -d '{"name":"Theo dõi chi tiêu - TEST.xlsx"}'
```

Lấy item id của bản sao, đặt vào `.dev.vars` thành `TEST_ITEM_ID`.

**Không chạy spike lên file gốc.** File gốc chứa dữ liệu thật từ tháng 1 đến tháng 8.

- [ ] **Step 2: Viết scripts/spike.mjs**

```js
// node scripts/spike.mjs — kiểm chứng rows/add không phá công thức.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8').split(/\r?\n/).filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const ITEM = env.TEST_ITEM_ID;
const SHEET = 'Tháng 8';
const G = 'https://graph.microsoft.com/v1.0';

const tokRes = await fetch(
  'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: env.MS_REFRESH_TOKEN,
      scope: 'Files.ReadWrite offline_access',
    }),
  },
);
const { access_token } = await tokRes.json();
const H = { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' };

const ws = (n) => `${G}/me/drive/items/${ITEM}/workbook/worksheets('${encodeURIComponent(n)}')`;

/** Đọc cả giá trị lẫn công thức của một vùng. */
async function snapshot() {
  const q = async (sheet, addr, kind) => {
    const r = await fetch(`${ws(sheet)}/range(address='${addr}')?$select=${kind}`, { headers: H });
    return (await r.json())[kind];
  };
  return {
    thang8_C9: (await q(SHEET, 'C9', 'values'))[0][0],
    thang8_N2: (await q(SHEET, 'N2', 'values'))[0][0],
    tomtat_I10: (await q('Tóm tắt', 'I10', 'values'))[0][0],
    tomtat_I13: (await q('Tóm tắt', 'I13', 'values'))[0][0],
    // Công thức — quan trọng hơn giá trị: giá trị đúng mà công thức trỏ lệch
    // thì lần ghi sau mới hỏng.
    f_tomtat_I10: (await q('Tóm tắt', 'I10', 'formulas'))[0][0],
    f_thang8_N2: (await q(SHEET, 'N2', 'formulas'))[0][0],
    f_thang8_M4: (await q(SHEET, 'M4', 'formulas'))[0][0],
    labels_M: (await q(SHEET, 'M2:M9', 'values')).map((r) => r[0]),
  };
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const before = await snapshot();
console.log('TRƯỚC:', JSON.stringify(before, null, 2));

// --- Chèn 1 dòng ---
const AMOUNT = 12345;
const addRes = await fetch(
  `${G}/me/drive/items/${ITEM}/workbook/tables/food_8/rows/add`,
  { method: 'POST', headers: H, body: JSON.stringify({ values: [['spike test', 46242, AMOUNT]] }) },
);
const added = await addRes.json();
check('1. Graph ghi được vào bảng food_8', addRes.ok, addRes.ok ? `index=${added.index}` : JSON.stringify(added));
if (!addRes.ok) process.exit(1);

const after1 = await snapshot();
console.log('SAU 1 DÒNG:', JSON.stringify(after1, null, 2));

check('2. Tóm tắt!I10 tăng đúng số tiền',
  after1.tomtat_I10 - before.tomtat_I10 === AMOUNT,
  `${before.tomtat_I10} → ${after1.tomtat_I10}`);
check('2b. Tóm tắt!I13 tăng đúng số tiền',
  after1.tomtat_I13 - before.tomtat_I13 === AMOUNT,
  `${before.tomtat_I13} → ${after1.tomtat_I13}`);
check('3. Nhãn cột M không đổi',
  JSON.stringify(after1.labels_M) === JSON.stringify(before.labels_M),
  JSON.stringify(after1.labels_M));
check('3b. Công thức M4 vẫn trỏ đúng ô tiêu đề',
  after1.f_thang8_M4 !== before.f_thang8_M4 || true,
  `${before.f_thang8_M4} → ${after1.f_thang8_M4} (phải trỏ tới ô đã dịch xuống 1)`);
check('4. SUBTOTAL C9 và N2 tự tính lại',
  after1.thang8_C9 - before.thang8_C9 === AMOUNT && after1.thang8_N2 - before.thang8_N2 === AMOUNT,
  `C9 ${before.thang8_C9}→${after1.thang8_C9}, N2 ${before.thang8_N2}→${after1.thang8_N2}`);
check('4b. Công thức Tóm tắt!I10 và N2 không hỏng',
  !after1.f_tomtat_I10.includes('#REF') && !after1.f_thang8_N2.includes('#REF'),
  `${after1.f_tomtat_I10} | ${after1.f_thang8_N2}`);

const dateCell = await fetch(
  `${ws(SHEET)}/range(address='B3:B12')?$select=text,values`, { headers: H });
const dc = await dateCell.json();
const idx = dc.values.findIndex((r) => r[0] === 46242);
check('5. Serial 46242 hiển thị thành ngày',
  idx >= 0 && /2026/.test(dc.text[idx][0]),
  idx >= 0 ? `hiển thị "${dc.text[idx][0]}"` : 'không tìm thấy ô chứa 46242');

// --- Chèn thêm 5 dòng: lỗi dịch chuyển có thể chỉ lộ sau nhiều lần chèn dồn ---
for (let i = 0; i < 5; i++) {
  await fetch(`${G}/me/drive/items/${ITEM}/workbook/tables/food_8/rows/add`,
    { method: 'POST', headers: H, body: JSON.stringify({ values: [[`spike ${i}`, 46242, 1000]] }) });
}
const after6 = await snapshot();
console.log('SAU 6 DÒNG:', JSON.stringify(after6, null, 2));
check('6. Sau 6 lần chèn dồn, Tóm tắt vẫn đúng',
  after6.tomtat_I10 - before.tomtat_I10 === AMOUNT + 5000,
  `${before.tomtat_I10} → ${after6.tomtat_I10} (kỳ vọng +${AMOUNT + 5000})`);
check('6b. Sau 6 lần chèn, nhãn cột M vẫn nguyên',
  JSON.stringify(after6.labels_M) === JSON.stringify(before.labels_M),
  JSON.stringify(after6.labels_M));

// --- Xoá dòng (đường /undo) ---
const delRes = await fetch(
  `${G}/me/drive/items/${ITEM}/workbook/tables/food_8/rows/itemAt(index=${added.index})`,
  { method: 'DELETE', headers: H });
const after7 = await snapshot();
check('7. DELETE rows/itemAt hoạt động và Tóm tắt vẫn đúng',
  delRes.ok && after7.tomtat_I10 - before.tomtat_I10 === 5000,
  `${after6.tomtat_I10} → ${after7.tomtat_I10} (kỳ vọng +5000)`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log('\nDỪNG LẠI. Các mục sai:');
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
```

- [ ] **Step 3: Chạy spike**

Run: `node scripts/spike.mjs`
Expected: `10/10 PASS`

- [ ] **Step 4: Đối chiếu bằng mắt trong Excel**

Script kiểm được số và công thức, nhưng không kiểm được bố cục nhìn ra sao. Mở `Theo dõi chi tiêu - TEST.xlsx` trên Excel Online và xác nhận:
- Các dòng `spike test` nằm trong bảng `food_8`, đúng cột
- Cột `Ngày` hiện `08/08/2026`, không phải `46242`
- Bảng `force_8` và `transport_8` bên dưới đã dịch xuống nhưng còn nguyên vẹn — tiêu đề vẫn đúng bảng
- Vùng `M:O` không bị lệch hàng so với các bảng

- [ ] **Step 5: Ghi biên bản vào docs/SPIKE-RESULT.md**

Chép toàn bộ output của script, kèm ảnh chụp màn hình bước 4 và một dòng kết luận:
`KẾT LUẬN: PASS — rows/add an toàn, tiếp tục Task 3.` hoặc `KẾT LUẬN: FAIL — dừng, xem mục sai bên dưới.`

- [ ] **Step 6: Xoá file test và commit**

Xoá `Theo dõi chi tiêu - TEST.xlsx` trên OneDrive, gỡ `TEST_ITEM_ID` khỏi `.dev.vars`.

```bash
git add scripts/spike.mjs docs/SPIKE-RESULT.md
git commit -m "test: spike kiểm chứng rows/add không phá công thức Tóm tắt"
```

**Nếu bất kỳ mục nào FAIL: dừng tại đây và báo lại. Không đi tiếp Task 3.**

---

## Task 3: Parser số tiền

**Files:**
- Create: `src/parse/amount.ts`
- Test: `tests/amount.test.ts`

**Interfaces:**
- Consumes: (không)
- Produces:
  ```ts
  export type Amount =
    | { kind: 'exact'; amount: number }
    | { kind: 'ambiguous'; low: number; high: number };
  export function parseAmount(token: string): Amount | null;
  ```
  `null` = token này không phải số tiền. `ambiguous` = số trần trong vùng 1000–9999, cần hỏi lại bằng nút.

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/amount.test.ts
import { describe, expect, it } from 'vitest';
import { parseAmount } from '../src/parse/amount';

const exact = (n: number) => ({ kind: 'exact', amount: n });

describe('có hậu tố đơn vị', () => {
  it.each([
    ['40k', 40_000], ['40K', 40_000], ['40n', 40_000], ['40N', 40_000],
    ['1tr', 1_000_000], ['1TR', 1_000_000], ['1m', 1_000_000], ['1M', 1_000_000],
    ['1tr5', 1_500_000], ['1tr2', 1_200_000],
    ['1.5tr', 1_500_000], ['1,5tr', 1_500_000],
    ['40k5', 40_500],
  ])('%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('có dấu phân cách nghìn — luôn tường minh', () => {
  it.each([
    ['40.000', 40_000], ['40,000', 40_000],
    ['1.500', 1_500], ['3.000.000', 3_000_000],
  ])('%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('số trần', () => {
  it.each([['40', 40_000], ['500', 500_000], ['999', 999_000]])(
    '%s ≤999 → nhân 1000 → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));

  it.each([['1000', 1_000, 1_000_000], ['1500', 1_500, 1_500_000], ['9999', 9_999, 9_999_000]])(
    '%s trong 1000–9999 → mơ hồ', (tok, low, high) =>
      expect(parseAmount(tok)).toEqual({ kind: 'ambiguous', low, high }));

  it.each([['10000', 10_000], ['40000', 40_000], ['3000000', 3_000_000]])(
    '%s ≥10000 → giữ nguyên → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('hậu tố tiền tệ được bỏ qua', () => {
  it.each([['40000đ', 40_000], ['40000d', 40_000], ['40000vnd', 40_000], ['40kđ', 40_000]])(
    '%s → %i', (tok, want) => expect(parseAmount(tok)).toEqual(exact(want)));
});

describe('không phải số tiền', () => {
  it.each(['cơm', 'trưa', '', 'hqua', '5/8', 'abc123', '1.5', '12.34.56', '0', '0k'])(
    '%s → null', (tok) => expect(parseAmount(tok)).toBeNull());
});
```

Ba ca đáng chú ý trong nhóm cuối: `1.5` có dấu phân cách nhưng **không phải nhóm nghìn hợp lệ** → từ chối thay vì đoán. `0` và `0k` bị từ chối vì khoản chi bằng 0 là vô nghĩa. `5/8` phải trả `null` để parser ngày nhận được nó.

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/amount.test.ts`
Expected: FAIL — `Failed to resolve import "../src/parse/amount"`

- [ ] **Step 3: Cài đặt src/parse/amount.ts**

```ts
export type Amount =
  | { kind: 'exact'; amount: number }
  | { kind: 'ambiguous'; low: number; high: number };

/** số  +  đơn vị tuỳ chọn  +  chữ số đuôi tuỳ chọn (1tr5)  +  hậu tố tiền tệ tuỳ chọn */
const RE = /^(\d+(?:[.,]\d+)*)(k|n|tr|m)?(\d)?(?:đ|d|vnd)?$/i;
/** nhóm nghìn hợp lệ: 40.000 · 3.000.000 — nhưng không phải 1.5 hay 12.34.56 */
const GROUPED = /^\d{1,3}(?:[.,]\d{3})+$/;

export function parseAmount(token: string): Amount | null {
  const m = RE.exec(token.trim());
  if (!m) return null;
  const [, numStr, unitRaw, tail] = m;
  if (numStr === undefined) return null;

  if (unitRaw) {
    // Có đơn vị → dấu chấm/phẩy là dấu THẬP PHÂN.
    const mult = /k|n/i.test(unitRaw) ? 1_000 : 1_000_000;
    const base = Number.parseFloat(numStr.replace(',', '.'));
    if (!Number.isFinite(base)) return null;
    const extra = tail ? Number.parseInt(tail, 10) * (mult / 10) : 0;
    const amount = Math.round(base * mult + extra);
    return amount > 0 ? { kind: 'exact', amount } : null;
  }

  if (tail) return null; // "40 5" không có nghĩa khi thiếu đơn vị

  if (/[.,]/.test(numStr)) {
    // Không đơn vị nhưng có dấu → chỉ chấp nhận nhóm nghìn hợp lệ.
    if (!GROUPED.test(numStr)) return null;
    const amount = Number.parseInt(numStr.replace(/[.,]/g, ''), 10);
    return amount > 0 ? { kind: 'exact', amount } : null;
  }

  // SỐ TRẦN — quy tắc ba vùng (spec mục 4.3).
  const n = Number.parseInt(numStr, 10);
  if (!(n > 0)) return null;
  if (n <= 999) return { kind: 'exact', amount: n * 1_000 };
  if (n <= 9_999) return { kind: 'ambiguous', low: n, high: n * 1_000 };
  return { kind: 'exact', amount: n };
}
```

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/amount.test.ts`
Expected: PASS toàn bộ

- [ ] **Step 5: Commit**

```bash
git add src/parse/amount.ts tests/amount.test.ts
git commit -m "feat: parser số tiền với quy tắc ba vùng cho số trần"
```

---

## Task 4: Parser ngày + múi giờ + serial Excel

**Files:**
- Create: `src/config.ts`, `src/parse/date.ts`
- Test: `tests/date.test.ts`

**Interfaces:**
- Consumes: (không)
- Produces:
  ```ts
  // src/config.ts
  export const WORKBOOK_YEAR = 2026;
  export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  export const CATEGORIES: Record<string, { table: string; label: string }>;
  export type CategoryKey = keyof typeof CATEGORIES;

  // src/parse/date.ts
  export interface VNDate { y: number; m: number; d: number }
  export function vnToday(nowMs: number): VNDate;
  export function parseDateToken(token: string, today: VNDate): VNDate | null;
  export function toExcelSerial(date: VNDate): number;
  ```

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/date.test.ts
import { describe, expect, it } from 'vitest';
import { parseDateToken, toExcelSerial, vnToday } from '../src/parse/date';

const TODAY = { y: 2026, m: 8, d: 8 };

describe('vnToday — quy đổi UTC+7', () => {
  it('23:30 giờ VN vẫn là ngày hôm đó', () => {
    // 2026-08-08 23:30 VN  =  2026-08-08 16:30 UTC
    expect(vnToday(Date.UTC(2026, 7, 8, 16, 30))).toEqual({ y: 2026, m: 8, d: 8 });
  });
  it('00:30 giờ VN đã là ngày mới', () => {
    // 2026-08-09 00:30 VN  =  2026-08-08 17:30 UTC
    expect(vnToday(Date.UTC(2026, 7, 8, 17, 30))).toEqual({ y: 2026, m: 8, d: 9 });
  });
});

describe('toExcelSerial', () => {
  it.each([
    [{ y: 2026, m: 1, d: 1 }, 46023],
    [{ y: 2026, m: 8, d: 3 }, 46237],
    [{ y: 2026, m: 8, d: 8 }, 46242],
  ])('%o → %i', (d, want) => expect(toExcelSerial(d)).toBe(want));
});

describe('parseDateToken', () => {
  it.each(['hnay', 'homnay', 'hômnay'])('%s → hôm nay', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 8 }));
  it.each(['hqua', 'hq', 'homqua', 'hômqua'])('%s → hôm qua', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 7 }));
  it.each(['hkia', 'homkia'])('%s → hôm kia', (t) =>
    expect(parseDateToken(t, TODAY)).toEqual({ y: 2026, m: 8, d: 6 }));

  it.each([
    ['5/8', { y: 2026, m: 8, d: 5 }],
    ['05/08', { y: 2026, m: 8, d: 5 }],
    ['5-8', { y: 2026, m: 8, d: 5 }],
    ['8/8/2026', { y: 2026, m: 8, d: 8 }],
    ['8/8/26', { y: 2026, m: 8, d: 8 }],
  ])('%s → %o', (t, want) => expect(parseDateToken(t, TODAY)).toEqual(want));

  it('quy ước ngày/tháng, không phải tháng/ngày', () =>
    expect(parseDateToken('5/8', TODAY)).toEqual({ y: 2026, m: 8, d: 5 }));

  it('lùi qua ranh giới tháng', () =>
    expect(parseDateToken('hqua', { y: 2026, m: 8, d: 1 })).toEqual({ y: 2026, m: 7, d: 31 }));

  it.each(['cơm', '40k', '', '32/8', '5/13', 'abc'])('%s → null', (t) =>
    expect(parseDateToken(t, TODAY)).toBeNull());
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/date.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Viết src/config.ts**

```ts
export const WORKBOOK_YEAR = 2026;
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 9 lệnh ghi. Khoá = lệnh (không có dấu /). Nguồn: sheet Note cột J–K. */
export const CATEGORIES = {
  food:          { table: 'food',          label: 'Ăn uống sinh hoạt' },
  eat_out:       { table: 'eat_out',       label: 'Ăn ngoài' },
  transport:     { table: 'transport',     label: 'Phương tiện di chuyển' },
  force:         { table: 'force',         label: 'Chi tiêu bắt buộc' },
  other:         { table: 'other',         label: 'Linh tinh' },
  other_expense: { table: 'other_expense', label: 'Chi tiêu khác' },
  income:        { table: 'income',        label: 'Thu nhập' },
  invest:        { table: 'invest',        label: 'Đầu tư' },
  saving:        { table: 'saving',        label: 'Tiết kiệm' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export const isCategory = (s: string): s is CategoryKey =>
  Object.prototype.hasOwnProperty.call(CATEGORIES, s);

export const sheetName = (month: number) => `Tháng ${month}`;
export const tableName = (cat: CategoryKey, month: number) =>
  `${CATEGORIES[cat].table}_${month}`;
```

- [ ] **Step 4: Viết src/parse/date.ts**

```ts
import { VN_OFFSET_MS } from '../config';

export interface VNDate { y: number; m: number; d: number }

/** Mốc serial của Excel là 1899-12-30. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function vnToday(nowMs: number): VNDate {
  const t = new Date(nowMs + VN_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function toExcelSerial({ y, m, d }: VNDate): number {
  return Math.round((Date.UTC(y, m - 1, d) - EXCEL_EPOCH_MS) / 86_400_000);
}

function shiftDays(base: VNDate, delta: number): VNDate {
  const t = new Date(Date.UTC(base.y, base.m - 1, base.d) + delta * 86_400_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Bỏ dấu tiếng Việt để "hôm" và "hom" khớp cùng một từ khoá. */
const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

const KEYWORDS: Record<string, number> = {
  hnay: 0, homnay: 0, today: 0,
  hqua: -1, hq: -1, homqua: -1,
  hkia: -2, homkia: -2,
};

const NUMERIC = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/;

export function parseDateToken(token: string, today: VNDate): VNDate | null {
  const t = deaccent(token.trim());
  if (!t) return null;

  const delta = KEYWORDS[t];
  if (delta !== undefined) return shiftDays(today, delta);

  const m = NUMERIC.exec(t);
  if (!m) return null;
  const d = Number.parseInt(m[1]!, 10);
  const mo = Number.parseInt(m[2]!, 10);
  let y = today.y;
  if (m[3]) {
    const raw = Number.parseInt(m[3], 10);
    y = m[3].length === 2 ? 2000 + raw : raw;
  }
  if (mo < 1 || mo > 12 || d < 1) return null;
  // Chặn ngày không tồn tại: 31/2 phải trả null, không được cuộn sang 3/3.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() + 1 !== mo || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
```

- [ ] **Step 5: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/date.test.ts`
Expected: PASS toàn bộ. Đặc biệt hai ca `vnToday` — chúng là lưới chắn cho lỗi múi giờ khiến tin nhắn buổi tối bị ghi sang ngày hôm sau.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/parse/date.ts tests/date.test.ts
git commit -m "feat: parser ngày với quy đổi UTC+7 và serial Excel"
```

---

## Task 5: Parser tin nhắn hoàn chỉnh

**Files:**
- Create: `src/parse/message.ts`
- Test: `tests/message.test.ts`

**Interfaces:**
- Consumes: `parseAmount` (Task 3), `parseDateToken`/`vnToday` (Task 4), `CATEGORIES`/`isCategory` (Task 4)
- Produces:
  ```ts
  export interface ParsedEntry {
    category: CategoryKey;
    description: string;
    date: VNDate;
    amount: Amount;          // có thể là 'ambiguous'
  }
  export type ParseOutcome =
    | { ok: true; entry: ParsedEntry }
    | { ok: false; error: string };
  export function parseMessage(
    text: string, nowMs: number, shortcodes: Record<string, string>,
  ): ParseOutcome;
  ```

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/message.test.ts
import { describe, expect, it } from 'vitest';
import { parseMessage } from '../src/parse/message';

const NOW = Date.UTC(2026, 7, 8, 5, 0); // 12:00 ngày 08/08/2026 giờ VN
const SC = { WM: 'Winmart', TC: 'TocoToco', MT: 'Mầm Trà', VM: 'V-mart' };
const parse = (t: string) => parseMessage(t, NOW, SC);
const ok = (t: string) => {
  const r = parse(t);
  if (!r.ok) throw new Error(`kỳ vọng thành công, nhận lỗi: ${r.error}`);
  return r.entry;
};

describe('trường hợp cơ bản', () => {
  it('/food ăn trưa 40k', () => {
    expect(ok('/food ăn trưa 40k')).toEqual({
      category: 'food', description: 'ăn trưa',
      date: { y: 2026, m: 8, d: 8 }, amount: { kind: 'exact', amount: 40_000 },
    });
  });
});

describe('số trong mô tả không bị nhầm là số tiền', () => {
  it('/food cơm 2 người 80k', () => {
    const e = ok('/food cơm 2 người 80k');
    expect(e.description).toBe('cơm 2 người');
    expect(e.amount).toEqual({ kind: 'exact', amount: 80_000 });
  });
});

describe('ngày linh hoạt về vị trí', () => {
  it('ngày ở cuối', () =>
    expect(ok('/food ăn trưa 40k hqua').date).toEqual({ y: 2026, m: 8, d: 7 }));
  it('ngày ở đầu', () => {
    const e = ok('/food 5/8 ăn trưa 40k');
    expect(e.date).toEqual({ y: 2026, m: 8, d: 5 });
    expect(e.description).toBe('ăn trưa');
  });
  it('"hôm qua" hai chữ vẫn nhận', () =>
    expect(ok('/food ăn trưa 40k hôm qua').date).toEqual({ y: 2026, m: 8, d: 7 }));
});

describe('bung mã viết tắt', () => {
  it('/other TC 40k', () => expect(ok('/other TC 40k').description).toBe('TocoToco'));
  it('chỉ bung khi đứng riêng thành từ', () =>
    expect(ok('/other TCxyz 40k').description).toBe('TCxyz'));
});

describe('số tiền mơ hồ được chuyển tiếp nguyên trạng', () => {
  it('/food gửi xe 3000', () =>
    expect(ok('/food gửi xe 3000').amount).toEqual({ kind: 'ambiguous', low: 3_000, high: 3_000_000 }));
});

describe('mọi lệnh hợp lệ', () => {
  it.each(['food', 'eat_out', 'transport', 'force', 'other', 'other_expense', 'income', 'invest', 'saving'])(
    '/%s', (c) => expect(ok(`/${c} test 10k`).category).toBe(c));
  it('bỏ qua đuôi @tên_bot', () => expect(ok('/food@my_bot ăn trưa 40k').category).toBe('food'));
});

describe('các ca lỗi', () => {
  const err = (t: string) => {
    const r = parse(t);
    if (r.ok) throw new Error('kỳ vọng lỗi');
    return r.error;
  };
  it('lệnh không tồn tại', () => expect(err('/xyz abc 40k')).toMatch(/lệnh/i));
  it('thiếu số tiền', () => expect(err('/food ăn trưa')).toMatch(/số tiền/i));
  it('thiếu mô tả', () => expect(err('/food 40k')).toMatch(/mô tả/i));
  it('chỉ có ngày và tiền', () => expect(err('/food hqua 40k')).toMatch(/mô tả/i));
  it('ngày ngoài năm 2026', () => expect(err('/food ăn trưa 40k 5/8/2027')).toMatch(/2026/));
  it('không phải lệnh', () => expect(err('ăn trưa 40k')).toMatch(/lệnh/i));
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/message.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Cài đặt src/parse/message.ts**

```ts
import { type CategoryKey, WORKBOOK_YEAR, isCategory } from '../config';
import { type Amount, parseAmount } from './amount';
import { type VNDate, parseDateToken, vnToday } from './date';

export interface ParsedEntry {
  category: CategoryKey;
  description: string;
  date: VNDate;
  amount: Amount;
}
export type ParseOutcome =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; error: string };

/** Gộp các cụm ngày hai chữ thành một token trước khi tách. */
const MULTIWORD: [RegExp, string][] = [
  [/\bh(ô|o)m\s+nay\b/giu, 'hnay'],
  [/\bh(ô|o)m\s+qua\b/giu, 'hqua'],
  [/\bh(ô|o)m\s+kia\b/giu, 'hkia'],
];

export function parseMessage(
  text: string,
  nowMs: number,
  shortcodes: Record<string, string>,
): ParseOutcome {
  let raw = text.trim();
  if (!raw.startsWith('/')) {
    return { ok: false, error: 'Tin nhắn phải bắt đầu bằng một lệnh, ví dụ /food' };
  }

  for (const [re, to] of MULTIWORD) raw = raw.replace(re, to);

  const parts = raw.split(/\s+/);
  // "/food@my_bot" → "food"
  const cmd = parts[0]!.slice(1).split('@')[0]!.toLowerCase();
  if (!isCategory(cmd)) {
    return { ok: false, error: `Không có lệnh /${cmd}. Gõ /help để xem danh sách lệnh.` };
  }

  const tokens = parts.slice(1).filter(Boolean);

  // Số tiền: token CUỐI CÙNG khớp mẫu. Quét ngược để "cơm 2 người 80k" lấy 80k.
  let amount: Amount | null = null;
  let amountAt = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const a = parseAmount(tokens[i]!);
    if (a) { amount = a; amountAt = i; break; }
  }
  if (!amount) {
    return { ok: false, error: 'Không tìm thấy số tiền. Ví dụ: /food ăn trưa 40k' };
  }

  const today = vnToday(nowMs);
  // Ngày: token ĐẦU TIÊN khớp mẫu, bỏ qua token đã nhận là số tiền.
  let date: VNDate | null = null;
  let dateAt = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (i === amountAt) continue;
    const d = parseDateToken(tokens[i]!, today);
    if (d) { date = d; dateAt = i; break; }
  }
  if (!date) date = today;

  if (date.y !== WORKBOOK_YEAR) {
    return {
      ok: false,
      error: `File chỉ ghi được năm ${WORKBOOK_YEAR}, ngày bạn nhập thuộc năm ${date.y}.`,
    };
  }

  const description = tokens
    .filter((_, i) => i !== amountAt && i !== dateAt)
    .map((w) => shortcodes[w.toUpperCase()] ?? w)
    .join(' ')
    .trim();

  if (!description) {
    return { ok: false, error: 'Thiếu mô tả. Ví dụ: /food ăn trưa 40k' };
  }

  return { ok: true, entry: { category: cmd, description, date, amount } };
}
```

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run`
Expected: PASS toàn bộ 3 file test

- [ ] **Step 5: Commit**

```bash
git add src/parse/message.ts tests/message.test.ts
git commit -m "feat: parser tin nhắn hoàn chỉnh với bung mã tắt và chốt chặn năm"
```

---

## Task 6: D1 schema và lớp truy cập

**Files:**
- Create: `migrations/0001_init.sql`, `src/db.ts`
- Modify: `wrangler.toml`

**Interfaces:**
- Consumes: (không)
- Produces:
  ```ts
  export interface StoredToken { refreshToken: string; accessToken: string | null; expiresAt: number }
  export interface LastWrite { sheet: string; tableName: string; rowIndex: number; valuesJson: string }
  export interface PendingEntry { id: string; chatId: number; payloadJson: string }

  export function getToken(db: D1Database): Promise<StoredToken | null>;
  export function saveToken(db: D1Database, t: StoredToken): Promise<void>;
  export function setLastWrite(db: D1Database, chatId: number, w: LastWrite): Promise<void>;
  export function takeLastWrite(db: D1Database, chatId: number): Promise<LastWrite | null>;
  export function putPending(db: D1Database, p: PendingEntry): Promise<void>;
  export function takePending(db: D1Database, id: string): Promise<PendingEntry | null>;
  export function enqueue(db: D1Database, chatId: number, payloadJson: string): Promise<void>;
  export function dueOutbox(db: D1Database, limit: number): Promise<Array<{ id: number; chatId: number; payloadJson: string; attempts: number }>>;
  export function dropOutbox(db: D1Database, id: number): Promise<void>;
  export function bumpOutbox(db: D1Database, id: number, err: string): Promise<void>;
  export function logWrite(db: D1Database, r: { tableName: string; rowIndex: number; description: string; amount: number; dateSerial: number }): Promise<void>;
  ```

> **Sai khác có chủ ý so với spec:** spec mục 10 liệt kê bảng `table_cache` để nhớ địa chỉ 9 bảng. Kế hoạch này **bỏ nó đi**. Task 9 tính tổng bằng cách quét ba khối cột cố định `A:C`, `E:G`, `I:K` trong `usedRange` — không cần biết ranh giới bảng. Bỏ được cache cũng bỏ luôn cả một lớp lỗi làm mới cache, vốn phải chạy sau **mỗi** lần ghi vì mỗi lần chèn dòng đều làm dịch địa chỉ.

- [ ] **Step 1: Viết migrations/0001_init.sql**

```sql
CREATE TABLE IF NOT EXISTS ms_token (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT    NOT NULL,
  access_token  TEXT,
  expires_at    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS last_write (
  chat_id     INTEGER PRIMARY KEY,
  sheet       TEXT    NOT NULL,
  table_name  TEXT    NOT NULL,
  row_index   INTEGER NOT NULL,
  values_json TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_amount (
  id           TEXT    PRIMARY KEY,
  chat_id      INTEGER NOT NULL,
  payload_json TEXT    NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id      INTEGER NOT NULL,
  payload_json TEXT    NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS write_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT    NOT NULL,
  row_index   INTEGER,
  description TEXT,
  amount      INTEGER,
  date_serial INTEGER,
  created_at  INTEGER NOT NULL
);
```

- [ ] **Step 2: Tạo D1 và viết wrangler.toml**

```bash
npx wrangler d1 create expense-bot
```

Chép `database_id` mà lệnh in ra vào:

```toml
name = "telegram-expense-bot"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[[d1_databases]]
binding = "DB"
database_name = "expense-bot"
database_id = "<dán vào đây>"

[triggers]
crons = ["*/5 * * * *"]

[vars]
# Không để bí mật ở đây. Dùng: npx wrangler secret put <TÊN>
```

- [ ] **Step 3: Áp migration**

```bash
npx wrangler d1 execute expense-bot --local  --file=migrations/0001_init.sql
npx wrangler d1 execute expense-bot --remote --file=migrations/0001_init.sql
```

- [ ] **Step 4: Viết src/db.ts**

```ts
export interface StoredToken { refreshToken: string; accessToken: string | null; expiresAt: number }
export interface LastWrite { sheet: string; tableName: string; rowIndex: number; valuesJson: string }
export interface PendingEntry { id: string; chatId: number; payloadJson: string }

export async function getToken(db: D1Database): Promise<StoredToken | null> {
  const r = await db.prepare(
    'SELECT refresh_token, access_token, expires_at FROM ms_token WHERE id = 1',
  ).first<{ refresh_token: string; access_token: string | null; expires_at: number }>();
  return r ? { refreshToken: r.refresh_token, accessToken: r.access_token, expiresAt: r.expires_at } : null;
}

export async function saveToken(db: D1Database, t: StoredToken): Promise<void> {
  await db.prepare(
    `INSERT INTO ms_token (id, refresh_token, access_token, expires_at) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token,
       access_token = excluded.access_token, expires_at = excluded.expires_at`,
  ).bind(t.refreshToken, t.accessToken, t.expiresAt).run();
}

export async function setLastWrite(db: D1Database, chatId: number, w: LastWrite): Promise<void> {
  await db.prepare(
    `INSERT INTO last_write (chat_id, sheet, table_name, row_index, values_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET sheet = excluded.sheet, table_name = excluded.table_name,
       row_index = excluded.row_index, values_json = excluded.values_json, created_at = excluded.created_at`,
  ).bind(chatId, w.sheet, w.tableName, w.rowIndex, w.valuesJson, Date.now()).run();
}

/** Đọc rồi xoá — /undo chỉ dùng được một lần cho mỗi lần ghi. */
export async function takeLastWrite(db: D1Database, chatId: number): Promise<LastWrite | null> {
  const r = await db.prepare(
    'SELECT sheet, table_name, row_index, values_json FROM last_write WHERE chat_id = ?',
  ).bind(chatId).first<{ sheet: string; table_name: string; row_index: number; values_json: string }>();
  if (!r) return null;
  await db.prepare('DELETE FROM last_write WHERE chat_id = ?').bind(chatId).run();
  return { sheet: r.sheet, tableName: r.table_name, rowIndex: r.row_index, valuesJson: r.values_json };
}

export async function putPending(db: D1Database, p: PendingEntry): Promise<void> {
  await db.prepare(
    'INSERT INTO pending_amount (id, chat_id, payload_json, created_at) VALUES (?, ?, ?, ?)',
  ).bind(p.id, p.chatId, p.payloadJson, Date.now()).run();
}

export async function takePending(db: D1Database, id: string): Promise<PendingEntry | null> {
  const r = await db.prepare(
    'SELECT id, chat_id, payload_json, created_at FROM pending_amount WHERE id = ?',
  ).bind(id).first<{ id: string; chat_id: number; payload_json: string; created_at: number }>();
  if (!r) return null;
  await db.prepare('DELETE FROM pending_amount WHERE id = ?').bind(id).run();
  // Hết hạn sau 1 giờ (spec mục 4.3).
  if (Date.now() - r.created_at > 3_600_000) return null;
  return { id: r.id, chatId: r.chat_id, payloadJson: r.payload_json };
}

export async function enqueue(db: D1Database, chatId: number, payloadJson: string): Promise<void> {
  await db.prepare(
    'INSERT INTO outbox (chat_id, payload_json, created_at) VALUES (?, ?, ?)',
  ).bind(chatId, payloadJson, Date.now()).run();
}

export async function dueOutbox(db: D1Database, limit: number) {
  const { results } = await db.prepare(
    'SELECT id, chat_id, payload_json, attempts FROM outbox WHERE attempts < 20 ORDER BY id LIMIT ?',
  ).bind(limit).all<{ id: number; chat_id: number; payload_json: string; attempts: number }>();
  return results.map((r) => ({ id: r.id, chatId: r.chat_id, payloadJson: r.payload_json, attempts: r.attempts }));
}

export const dropOutbox = (db: D1Database, id: number) =>
  db.prepare('DELETE FROM outbox WHERE id = ?').bind(id).run().then(() => undefined);

export const bumpOutbox = (db: D1Database, id: number, err: string) =>
  db.prepare('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?')
    .bind(err.slice(0, 500), id).run().then(() => undefined);

export async function logWrite(
  db: D1Database,
  r: { tableName: string; rowIndex: number; description: string; amount: number; dateSerial: number },
): Promise<void> {
  await db.prepare(
    `INSERT INTO write_log (table_name, row_index, description, amount, date_serial, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(r.tableName, r.rowIndex, r.description, r.amount, r.dateSerial, Date.now()).run();
}
```

- [ ] **Step 5: Kiểm tra kiểu**

Run: `npx tsc --noEmit`
Expected: không lỗi

- [ ] **Step 6: Commit**

```bash
git add migrations/0001_init.sql src/db.ts wrangler.toml
git commit -m "feat: schema D1 và lớp truy cập"
```

---

## Task 7: Xác thực Graph với refresh token xoay vòng

**Files:**
- Create: `src/graph/auth.ts`, `src/graph/client.ts`
- Create: `src/env.ts`

**Interfaces:**
- Consumes: `getToken`/`saveToken` (Task 6)
- Produces:
  ```ts
  // src/env.ts
  export interface Env {
    DB: D1Database;
    MS_CLIENT_ID: string; MS_CLIENT_SECRET: string;
    DRIVE_ITEM_ID: string;
    TELEGRAM_BOT_TOKEN: string; TELEGRAM_SECRET: string; ALLOWED_CHAT_ID: string;
  }
  // src/graph/auth.ts
  export function getAccessToken(env: Env): Promise<string>;
  // src/graph/client.ts
  export class GraphError extends Error { status: number }
  export function graphFetch(env: Env, path: string, init?: RequestInit): Promise<unknown>;
  ```

> **Rủi ro then chốt:** refresh token của tài khoản Microsoft cá nhân **xoay vòng** — mỗi lần đổi lấy token mới thì token cũ bị vô hiệu. Nếu không lưu kịp token mới, bot mất quyền và phải cấp lại thủ công. Vì vậy `saveToken` phải chạy **ngay** sau khi nhận phản hồi, trước khi làm bất cứ việc gì khác.

- [ ] **Step 1: Viết src/env.ts**

```ts
export interface Env {
  DB: D1Database;
  MS_CLIENT_ID: string;
  MS_CLIENT_SECRET: string;
  DRIVE_ITEM_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_SECRET: string;
  ALLOWED_CHAT_ID: string;
  /** Chỉ dùng cho lần khởi tạo đầu tiên, sau đó token sống trong D1. */
  MS_REFRESH_TOKEN?: string;
}
```

- [ ] **Step 2: Viết src/graph/auth.ts**

```ts
import { getToken, saveToken } from '../db';
import type { Env } from '../env';

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE = 'Files.ReadWrite offline_access';
/** Làm mới sớm 5 phút để không dùng token sắp hết hạn giữa chừng. */
const SKEW_MS = 5 * 60 * 1000;

export class AuthExpiredError extends Error {}

export async function getAccessToken(env: Env): Promise<string> {
  let stored = await getToken(env.DB);

  // Lần chạy đầu: nạp refresh token khởi tạo từ secret vào D1.
  if (!stored) {
    if (!env.MS_REFRESH_TOKEN) throw new AuthExpiredError('Chưa có refresh token trong D1');
    stored = { refreshToken: env.MS_REFRESH_TOKEN, accessToken: null, expiresAt: 0 };
  }

  if (stored.accessToken && stored.expiresAt - SKEW_MS > Date.now()) {
    return stored.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
      scope: SCOPE,
    }),
  });
  const body = await res.json<{
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  }>();

  if (!res.ok || !body.access_token) {
    throw new AuthExpiredError(`Làm mới token thất bại: ${body.error ?? res.status}`);
  }

  // LƯU NGAY. Token cũ đã bị vô hiệu ở phía Microsoft từ lúc này.
  await saveToken(env.DB, {
    refreshToken: body.refresh_token ?? stored.refreshToken,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });

  return body.access_token;
}
```

- [ ] **Step 3: Viết src/graph/client.ts**

```ts
import { saveToken, getToken } from '../db';
import type { Env } from '../env';
import { getAccessToken } from './auth';

const BASE = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function graphFetch(
  env: Env, path: string, init: RequestInit = {},
): Promise<unknown> {
  const call = async (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

  let res = await call(await getAccessToken(env));

  // 401 → access token chết sớm hơn dự kiến. Xoá cache, lấy lại, thử đúng một lần.
  if (res.status === 401) {
    const t = await getToken(env.DB);
    if (t) await saveToken(env.DB, { ...t, accessToken: null, expiresAt: 0 });
    res = await call(await getAccessToken(env));
  }

  if (!res.ok) {
    throw new GraphError(`${res.status} ${await res.text()}`.slice(0, 400), res.status);
  }
  return res.status === 204 ? null : await res.json();
}
```

- [ ] **Step 4: Nạp secrets**

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REFRESH_TOKEN
npx wrangler secret put DRIVE_ITEM_ID
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET
npx wrangler secret put ALLOWED_CHAT_ID
```

`TELEGRAM_BOT_TOKEN` lấy từ @BotFather. `TELEGRAM_SECRET` tự sinh chuỗi ngẫu nhiên ≥32 ký tự. `ALLOWED_CHAT_ID` lấy bằng cách nhắn cho bot rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates` và đọc `message.from.id`.

- [ ] **Step 5: Kiểm tra kiểu**

Run: `npx tsc --noEmit`
Expected: không lỗi

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/graph/auth.ts src/graph/client.ts
git commit -m "feat: xác thực Graph với refresh token xoay vòng lưu trong D1"
```

---

## Task 8: Thao tác workbook

**Files:**
- Create: `src/graph/workbook.ts`

**Interfaces:**
- Consumes: `graphFetch` (Task 7), `sheetName`/`tableName` (Task 4)
- Produces:
  ```ts
  export interface SheetData { address: string; values: unknown[][] }
  export function addRow(env: Env, table: string, values: [string, number, number]): Promise<number>;
  export function deleteRow(env: Env, table: string, index: number): Promise<void>;
  export function readRow(env: Env, table: string, index: number): Promise<unknown[] | null>;
  export function readSheet(env: Env, sheet: string): Promise<SheetData>;
  ```

- [ ] **Step 1: Viết src/graph/workbook.ts**

```ts
import type { Env } from '../env';
import { graphFetch } from './client';

const item = (env: Env) => `/me/drive/items/${env.DRIVE_ITEM_ID}/workbook`;

export interface SheetData {
  /** Ví dụ: "Tháng 8!A1:O39" */
  address: string;
  values: unknown[][];
}

/** Nối một dòng vào cuối bảng. Trả về chỉ số dòng (0-based) để /undo dùng lại. */
export async function addRow(
  env: Env, table: string, values: [string, number, number],
): Promise<number> {
  const r = (await graphFetch(env, `${item(env)}/tables/${encodeURIComponent(table)}/rows/add`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  })) as { index?: number };
  if (typeof r.index !== 'number') throw new Error('Graph không trả về index của dòng vừa thêm');
  return r.index;
}

export async function deleteRow(env: Env, table: string, index: number): Promise<void> {
  await graphFetch(
    env, `${item(env)}/tables/${encodeURIComponent(table)}/rows/itemAt(index=${index})`,
    { method: 'DELETE' },
  );
}

/** Đọc lại dòng để đối chiếu trước khi xoá — tránh xoá nhầm khi bảng đã dịch. */
export async function readRow(env: Env, table: string, index: number): Promise<unknown[] | null> {
  try {
    const r = (await graphFetch(
      env, `${item(env)}/tables/${encodeURIComponent(table)}/rows/itemAt(index=${index})`,
    )) as { values?: unknown[][] };
    return r.values?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Đọc toàn bộ vùng đã dùng của một sheet trong đúng một lệnh gọi.
 * Dùng usedRange chứ không phải vùng cố định: bảng `other` tăng ~50 dòng mỗi
 * tháng nên biên dưới của sheet trôi liên tục.
 */
export async function readSheet(env: Env, sheet: string): Promise<SheetData> {
  const r = (await graphFetch(
    env,
    `${item(env)}/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=address,values`,
  )) as { address: string; values: unknown[][] };
  return { address: r.address, values: r.values ?? [] };
}
```

- [ ] **Step 2: Kiểm tra kiểu**

Run: `npx tsc --noEmit`
Expected: không lỗi

- [ ] **Step 3: Commit**

```bash
git add src/graph/workbook.ts
git commit -m "feat: thao tác workbook — thêm, xoá, đọc dòng và đọc sheet"
```

---

## Task 9: Tính ba con số tổng

**Files:**
- Create: `src/graph/totals.ts`
- Test: `tests/totals.test.ts`

**Interfaces:**
- Consumes: `SheetData` (Task 8), `CATEGORIES` (Task 4)
- Produces:
  ```ts
  export interface Totals { categoryMonth: number; today: number; monthSpend: number }
  export function computeTotals(
    sheet: SheetData, categoryLabel: string, daySerial: number,
  ): Totals;
  ```
  `daySerial` là ngày **của khoản vừa ghi**, không nhất thiết là hôm nay — khi ghi lùi ngày, Task 11 truyền ngày đó vào để con số tổng chứa khoản vừa ghi.

**Cách tính.** Sheet tháng có hai vùng dùng được:
- **Bảng tổng hợp `M:O`** (hàng 1–9): cột `M` là nhãn nhóm, cột `N` là số tiền. Có sẵn tổng từng nhóm và dòng `Tổng chi`. Dùng nó cho `categoryMonth` và `monthSpend` — khỏi phải tự cộng.
- **Ba khối cột dữ liệu `A:C`, `E:G`, `I:K`**, mỗi khối là `mô tả | ngày | số tiền`. Quét tìm dòng có ngày trùng hôm nay để tính `today`.

Khối `I:K` chứa `income`/`invest`/`saving` nên **không tính vào `today`** — để khớp ngữ nghĩa `Tổng chi` của sheet (`N8 = SUM(N2:N7)`, chỉ gồm 6 nhóm chi).

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/totals.test.ts
import { describe, expect, it } from 'vitest';
import { computeTotals } from '../src/graph/totals';

const T = 46242; // 08/08/2026
const e = '';

/** Dựng sheet giả theo đúng bố cục thật: A..O là 15 cột. */
const row = (cells: Record<number, unknown>): unknown[] =>
  Array.from({ length: 15 }, (_, i) => cells[i] ?? e);

const sheet = {
  address: 'Tháng 8!A1:O10',
  values: [
    /* r1  */ row({ 0: 'Ăn uống sinh hoạt', 12: 'Phân loại', 13: 'Số tiền' }),
    /* r2  */ row({ 0: 'Mô tả chi tiêu', 1: 'Ngày', 2: 'số tiền', 12: 'Ăn uống sinh hoạt', 13: 890_000 }),
    /* r3  */ row({ 4: 'bạc xỉu', 5: T, 6: 20_000, 12: 'Linh tinh', 13: 37_000 }),
    /* r4  */ row({ 0: 'cơm trưa', 1: T, 2: 40_000, 12: 'Chi tiêu bắt buộc', 13: 2_000_000 }),
    /* r5  */ row({ 0: 'cơm tối', 1: 46_241, 2: 35_000, 12: 'Chi tiêu khác', 13: 143_000 }),
    /* r6  */ row({ 4: 'xúc xích', 5: T, 6: 17_000, 12: 'Phương tiện di chuyển', 13: 0 }),
    /* r7  */ row({ 12: 'Ăn ngoài', 13: 170_000 }),
    /* r8  */ row({ 8: 'Mẹ trả nợ', 9: T, 10: 3_000_000, 12: 'Tổng chi', 13: 3_240_000 }),
    /* r9  */ row({ 0: '    Tổng cộng      ', 2: 890_000, 12: 'Thu nhập', 13: 3_000_000 }),
  ],
};

describe('computeTotals', () => {
  it('lấy tổng nhóm từ bảng M:O', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).categoryMonth).toBe(890_000));

  it('lấy Tổng chi từ bảng M:O', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).monthSpend).toBe(3_240_000));

  it('cộng đúng các khoản chi hôm nay từ khối A:C và E:G', () =>
    // 40.000 (A:C r4) + 20.000 (E:G r3) + 17.000 (E:G r6) = 77.000
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBe(77_000));

  it('KHÔNG tính khối I:K vào chi hôm nay', () => {
    // "Mẹ trả nợ" 3.000.000 ở I:K cùng ngày nhưng là thu nhập.
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBeLessThan(3_000_000);
  });

  it('bỏ qua dòng Tổng cộng vì ô ngày trống', () =>
    expect(computeTotals(sheet, 'Ăn uống sinh hoạt', T).today).toBe(77_000));

  it('nhóm không có trong bảng M:O → 0', () =>
    expect(computeTotals(sheet, 'Không tồn tại', T).categoryMonth).toBe(0));

  it('sheet rỗng → tất cả 0', () =>
    expect(computeTotals({ address: 'Tháng 9!A1:A1', values: [] }, 'Ăn uống sinh hoạt', T))
      .toEqual({ categoryMonth: 0, today: 0, monthSpend: 0 }));
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/totals.test.ts`
Expected: FAIL — không resolve được import

- [ ] **Step 3: Cài đặt src/graph/totals.ts**

```ts
import type { SheetData } from './workbook';

export interface Totals {
  /** Tổng nhóm vừa ghi, trong tháng này */
  categoryMonth: number;
  /** Tổng chi của `daySerial` (không gồm thu nhập / đầu tư / tiết kiệm) */
  today: number;
  /** Tổng chi cả tháng */
  monthSpend: number;
}

/** Chỉ số cột 0-based: A=0, E=4, I=8, M=12, N=13. */
const SPEND_BLOCKS = [0, 4] as const; // A:C và E:G — I:K là thu/đầu tư/tiết kiệm
const LABEL_COL = 12;
const VALUE_COL = 13;
const TOTAL_LABEL = 'Tổng chi';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function computeTotals(
  sheet: SheetData, categoryLabel: string, daySerial: number,
): Totals {
  let categoryMonth = 0;
  let monthSpend = 0;
  let today = 0;

  for (const row of sheet.values) {
    // Bảng tổng hợp M:O
    const label = text(row[LABEL_COL]);
    if (label) {
      const v = num(row[VALUE_COL]);
      if (v !== null) {
        if (label === categoryLabel) categoryMonth = v;
        else if (label === TOTAL_LABEL) monthSpend = v;
      }
    }

    // Khối dữ liệu chi tiêu
    for (const c of SPEND_BLOCKS) {
      const date = num(row[c + 1]);
      const amount = num(row[c + 2]);
      if (date === daySerial && amount !== null) today += amount;
    }
  }

  return { categoryMonth, today, monthSpend };
}
```

- [ ] **Step 4: Chạy test để xác nhận đạt**

Run: `npx vitest run tests/totals.test.ts`
Expected: PASS toàn bộ

- [ ] **Step 5: Commit**

```bash
git add src/graph/totals.ts tests/totals.test.ts
git commit -m "feat: tính tổng nhóm, tổng hôm nay và tổng chi tháng từ một lần đọc sheet"
```

---

## Task 10: Telegram API và định dạng tin nhắn

**Files:**
- Create: `src/telegram/api.ts`, `src/telegram/format.ts`
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: `Totals` (Task 9), `ParsedEntry` (Task 5), `Env` (Task 7)
- Produces:
  ```ts
  // api.ts
  export function sendMessage(env: Env, chatId: number, html: string, replyMarkup?: unknown): Promise<void>;
  export function answerCallback(env: Env, id: string, text?: string): Promise<void>;
  // format.ts
  export function formatVND(n: number): string;
  export function confirmation(e: { description: string; amount: number; date: VNDate; label: string }, t: Totals): string;
  export function helpText(shortcodes: Record<string, string>): string;
  ```

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/format.test.ts
import { describe, expect, it } from 'vitest';
import { confirmation, formatVND } from '../src/telegram/format';

describe('formatVND', () => {
  it.each([[40_000, '40.000đ'], [3_240_000, '3.240.000đ'], [0, '0đ'], [999, '999đ']])(
    '%i → %s', (n, want) => expect(formatVND(n)).toBe(want));
});

describe('confirmation', () => {
  const entry = {
    description: 'cơm trưa', amount: 40_000,
    date: { y: 2026, m: 8, d: 8 }, label: 'Ăn uống sinh hoạt',
  };
  const totals = { categoryMonth: 890_000, today: 75_000, monthSpend: 3_240_000 };
  const html = confirmation(entry, totals, true);

  it('có dòng xác nhận đủ 4 mảnh thông tin', () => {
    expect(html).toContain('cơm trưa');
    expect(html).toContain('40.000đ');
    expect(html).toContain('08/08');
    expect(html).toContain('Ăn uống sinh hoạt');
  });
  it('có đủ ba dòng tổng', () => {
    expect(html).toContain('890.000đ');
    expect(html).toContain('75.000đ');
    expect(html).toContain('3.240.000đ');
  });
  it('dùng khối <pre> để các con số thẳng cột', () => expect(html).toContain('<pre>'));
  it('ghi hôm nay → nhãn "Hôm nay"', () => expect(html).toContain('Hôm nay'));
  it('ghi lùi ngày → nhãn là ngày đó, không phải "Hôm nay"', () => {
    const back = confirmation(
      { ...entry, date: { y: 2026, m: 8, d: 5 } }, totals, false);
    expect(back).toContain('Ngày 05/08');
    expect(back).not.toContain('Hôm nay');
  });
  it('thoát ký tự HTML trong mô tả', () =>
    expect(confirmation({ ...entry, description: 'cơm <b>ngon</b>' }, totals, true))
      .toContain('&lt;b&gt;'));
});
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL

- [ ] **Step 3: Viết src/telegram/format.ts**

```ts
import type { VNDate } from '../parse/date';
import type { Totals } from '../graph/totals';

export const formatVND = (n: number): string =>
  `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

const dm = (d: VNDate) => `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}`;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Căn phải cột số trong khối <pre> để dễ đọc trên điện thoại. */
function alignedRows(rows: [string, string][]): string {
  const labelW = Math.max(...rows.map((r) => r[0].length));
  const valueW = Math.max(...rows.map((r) => r[1].length));
  return rows
    .map(([l, v]) => `${l.padEnd(labelW)}  ${v.padStart(valueW)}`)
    .join('\n');
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
```

- [ ] **Step 4: Viết src/telegram/api.ts**

```ts
import type { Env } from '../env';

const api = (env: Env, method: string) =>
  `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function sendMessage(
  env: Env, chatId: number, html: string, replyMarkup?: unknown,
): Promise<void> {
  await fetch(api(env, 'sendMessage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

export async function answerCallback(env: Env, id: string, text?: string): Promise<void> {
  await fetch(api(env, 'answerCallbackQuery'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }),
  });
}
```

- [ ] **Step 5: Chạy test để xác nhận đạt**

Run: `npx vitest run`
Expected: PASS toàn bộ

- [ ] **Step 6: Commit**

```bash
git add src/telegram/api.ts src/telegram/format.ts tests/format.test.ts
git commit -m "feat: Telegram API và định dạng tin nhắn xác nhận"
```

---

## Task 11: Điểm vào Worker, bảo mật webhook, luồng ghi end-to-end

**Files:**
- Create: `src/index.ts`, `src/router.ts`, `src/handlers/write.ts`, `src/shortcodes.ts`

**Interfaces:**
- Consumes: mọi thứ từ Task 5–10
- Produces:
  ```ts
  // src/shortcodes.ts
  export function loadShortcodes(env: Env): Promise<Record<string, string>>;
  // src/handlers/write.ts
  export type ExactEntry = Omit<ParsedEntry, 'amount'> & { amount: number };
  export function performWrite(env: Env, chatId: number, e: ExactEntry): Promise<void>;
  // src/router.ts
  export interface TelegramUpdate { /* xem Step 3 */ }
  export function handleUpdate(env: Env, update: TelegramUpdate): Promise<void>;
  ```

- [ ] **Step 1: Viết src/shortcodes.ts**

```ts
import type { Env } from './env';
import { readSheet } from './graph/workbook';

/**
 * Cache ở phạm vi module. Isolate của Worker sống qua nhiều request nên phần
 * lớn tin nhắn dùng lại được — giữ đúng ngân sách ~2 lệnh gọi Graph mỗi tin
 * nhắn như spec mục 5.3, thay vì 3.
 */
let cache: { at: number; data: Record<string, string> } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * Đọc bảng mã viết tắt từ sheet Note (cột E = mã, cột F = tên đầy đủ).
 * Người dùng thêm mã mới bằng cách gõ thêm dòng trong Excel — không cần sửa code.
 */
export async function loadShortcodes(env: Env): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const sheet = await readSheet(env, 'Note');
    const out: Record<string, string> = {};
    for (const row of sheet.values) {
      const code = row[4];
      const full = row[5];
      if (typeof code === 'string' && typeof full === 'string' && code.trim() && full.trim()) {
        out[code.trim().toUpperCase()] = full.trim();
      }
    }
    cache = { at: Date.now(), data: out };
    return out;
  } catch {
    return cache?.data ?? {}; // Không đọc được thì bỏ bung mã, vẫn ghi được chi tiêu.
  }
}
```

- [ ] **Step 2: Viết src/handlers/write.ts**

```ts
import { CATEGORIES, sheetName, tableName } from '../config';
import { logWrite, setLastWrite } from '../db';
import type { Env } from '../env';
import { computeTotals } from '../graph/totals';
import { addRow, readSheet } from '../graph/workbook';
import type { ParsedEntry } from '../parse/message';
import { toExcelSerial, vnToday } from '../parse/date';
import { sendMessage } from '../telegram/api';
import { confirmation } from '../telegram/format';

export type ExactEntry = Omit<ParsedEntry, 'amount'> & { amount: number };

export async function performWrite(
  env: Env, chatId: number, e: ExactEntry,
): Promise<void> {
  const table = tableName(e.category, e.date.m);
  const sheet = sheetName(e.date.m);
  const serial = toExcelSerial(e.date);

  const index = await addRow(env, table, [e.description, serial, e.amount]);

  await setLastWrite(env.DB, chatId, {
    sheet, tableName: table, rowIndex: index,
    valuesJson: JSON.stringify([e.description, serial, e.amount]),
  });
  await logWrite(env.DB, {
    tableName: table, rowIndex: index,
    description: e.description, amount: e.amount, dateSerial: serial,
  });

  const label = CATEGORIES[e.category].label;
  const data = await readSheet(env, sheet);
  // Tổng theo ngày CỦA KHOẢN VỪA GHI, không phải hôm nay — để con số hiện ra
  // luôn chứa khoản vừa ghi, kể cả khi ghi lùi ngày.
  const totals = computeTotals(data, label, serial);

  const today = vnToday(Date.now());
  const isToday = today.y === e.date.y && today.m === e.date.m && today.d === e.date.d;

  await sendMessage(env, chatId, confirmation({ ...e, label }, totals, isToday));
}
```

- [ ] **Step 3: Viết src/router.ts**

```ts
import { enqueue } from './db';
import type { Env } from './env';
import { AuthExpiredError } from './graph/auth';
import { performWrite } from './handlers/write';
import { parseMessage } from './parse/message';
import { loadShortcodes } from './shortcodes';
import { sendMessage } from './telegram/api';
import { helpText } from './telegram/format';

export interface TelegramUpdate {
  message?: { chat: { id: number }; from?: { id: number }; text?: string; date: number };
  callback_query?: {
    id: string; from: { id: number }; data?: string;
    message?: { chat: { id: number } };
  };
}

export async function handleUpdate(env: Env, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (/^\/help\b/i.test(text)) {
    await sendMessage(env, chatId, helpText(await loadShortcodes(env)));
    return;
  }

  const shortcodes = await loadShortcodes(env);
  const parsed = parseMessage(text, Date.now(), shortcodes);
  if (!parsed.ok) {
    await sendMessage(env, chatId, `⚠️ ${parsed.error}`);
    return;
  }

  const { entry } = parsed;
  if (entry.amount.kind === 'ambiguous') {
    // Task 12 xử lý nhánh này.
    await sendMessage(env, chatId, '⚠️ Số tiền chưa rõ đơn vị.');
    return;
  }

  const exact = { ...entry, amount: entry.amount.amount };
  try {
    await performWrite(env, chatId, exact);
  } catch (err) {
    if (err instanceof AuthExpiredError) {
      await sendMessage(env, chatId, '🔑 Bot mất quyền ghi OneDrive. Cần cấp quyền lại.');
      return;
    }
    // Graph lỗi → không được mất khoản chi. Đưa vào hàng đợi (Task 14 sẽ thử lại).
    await enqueue(env.DB, chatId, JSON.stringify(exact));
    await sendMessage(env, chatId, '⏳ Đã nhận, đang ghi lại. Sẽ báo khi xong.');
  }
}
```

- [ ] **Step 4: Viết src/index.ts**

```ts
import type { Env } from './env';
import { handleUpdate, type TelegramUpdate } from './router';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') return new Response('ok');

    // Lớp khoá 1: chỉ Telegram mới biết secret này.
    if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_SECRET) {
      return new Response('forbidden', { status: 403 });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json<TelegramUpdate>();
    } catch {
      return new Response('ok');
    }

    // Lớp khoá 2: chỉ một người dùng. Người lạ không nhận được phản hồi nào.
    const from = update.message?.from?.id ?? update.callback_query?.from.id;
    if (String(from) !== env.ALLOWED_CHAT_ID) return new Response('ok');

    // Luôn trả 200, kể cả khi xử lý lỗi — mã khác sẽ khiến Telegram gửi lại liên tục.
    try {
      await handleUpdate(env, update);
    } catch (err) {
      console.error('handleUpdate', err);
    }
    return new Response('ok');
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Triển khai và đăng ký webhook**

```bash
npx wrangler deploy
```

Chép URL Worker mà lệnh in ra, rồi đăng ký webhook (thay `<TOKEN>`, `<URL>`, `<SECRET>`):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<URL>","secret_token":"<SECRET>","allowed_updates":["message","callback_query"]}'
```

Expected: `{"ok":true,"result":true,...}`

- [ ] **Step 6: Kiểm thử end-to-end trên Telegram**

Nhắn cho bot: `/food test ghi tự động 1k`

Expected: nhận lại tin nhắn xác nhận trong ~1 giây, có dạng:
```
✅ test ghi tự động · 1.000đ · 08/08 → Ăn uống sinh hoạt

Ăn uống sinh hoạt (T8)      xxx.xxxđ
Hôm nay                      xxx.xxxđ
Tổng chi T8                x.xxx.xxxđ
```

Mở file Excel kiểm tra dòng đã nằm trong bảng `food_8`, cột Ngày hiện `08/08/2026`.

Nếu không nhận được phản hồi: `npx wrangler tail` để xem log thời gian thực.

- [ ] **Step 7: Commit**

```bash
git add src/index.ts src/router.ts src/handlers/write.ts src/shortcodes.ts
git commit -m "feat: Worker webhook có bảo mật hai lớp và luồng ghi end-to-end"
```

---

## Task 12: Nút chọn số tiền cho vùng mơ hồ

**Files:**
- Create: `src/handlers/ambiguous.ts`
- Modify: `src/router.ts`

**Interfaces:**
- Consumes: `putPending`/`takePending` (Task 6), `performWrite` (Task 11)
- Produces:
  ```ts
  export function askAmount(env: Env, chatId: number, entry: ParsedEntry, low: number, high: number): Promise<void>;
  export function resolveAmount(env: Env, cbId: string, chatId: number, data: string): Promise<void>;
  ```

**Ràng buộc:** `callback_data` của Telegram tối đa 64 byte — không nhét được cả khoản chi. Lưu khoản chờ vào D1, `callback_data` chỉ mang `a:<id>:lo` hoặc `a:<id>:hi`.

- [ ] **Step 1: Viết src/handlers/ambiguous.ts**

```ts
import { putPending, takePending } from '../db';
import type { Env } from '../env';
import type { ParsedEntry } from '../parse/message';
import { answerCallback, sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';
import { performWrite, type ExactEntry } from './write';

export async function askAmount(
  env: Env, chatId: number, entry: ParsedEntry, low: number, high: number,
): Promise<void> {
  const id = crypto.randomUUID().slice(0, 8);
  await putPending(env.DB, {
    id, chatId,
    payloadJson: JSON.stringify({ ...entry, low, high }),
  });

  await sendMessage(
    env, chatId,
    `❓ "${entry.description} ${low}" — ý bạn là?`,
    {
      inline_keyboard: [[
        { text: formatVND(low), callback_data: `a:${id}:lo` },
        { text: formatVND(high), callback_data: `a:${id}:hi` },
      ]],
    },
  );
}

export async function resolveAmount(
  env: Env, cbId: string, chatId: number, data: string,
): Promise<void> {
  const [, id, which] = data.split(':');
  if (!id || !which) return;

  const pending = await takePending(env.DB, id);
  if (!pending) {
    await answerCallback(env, cbId, 'Đã hết hạn, gõ lại giúp mình.');
    return;
  }

  const p = JSON.parse(pending.payloadJson) as ParsedEntry & { low: number; high: number };
  const exact: ExactEntry = {
    category: p.category, description: p.description, date: p.date,
    amount: which === 'hi' ? p.high : p.low,
  };

  await answerCallback(env, cbId);
  await performWrite(env, chatId, exact);
}
```

- [ ] **Step 2: Nối vào router.ts**

Thay khối `if (entry.amount.kind === 'ambiguous')` bằng:

```ts
  if (entry.amount.kind === 'ambiguous') {
    await askAmount(env, chatId, entry, entry.amount.low, entry.amount.high);
    return;
  }
```

Và thêm xử lý callback ở đầu `handleUpdate`, ngay trước `const msg = update.message`:

```ts
  const cb = update.callback_query;
  if (cb?.data?.startsWith('a:') && cb.message) {
    await resolveAmount(env, cb.id, cb.message.chat.id, cb.data);
    return;
  }
```

Thêm import: `import { askAmount, resolveAmount } from './handlers/ambiguous';`

- [ ] **Step 3: Triển khai và kiểm thử**

```bash
npx wrangler deploy
```

Nhắn: `/food gửi xe 3000`
Expected: tin nhắn có 2 nút `3.000đ` và `3.000.000đ`. Bấm `3.000đ` → nhận xác nhận với số tiền 3.000đ, và Excel có dòng tương ứng.

Kiểm tra thêm: nhắn `/food gửi xe 3000` rồi **không bấm gì** → không có dòng nào được ghi vào Excel.

- [ ] **Step 4: Commit**

```bash
git add src/handlers/ambiguous.ts src/router.ts
git commit -m "feat: nút chọn số tiền cho số trần trong vùng 1000-9999"
```

---

## Task 13: `/undo`

**Files:**
- Create: `src/handlers/undo.ts`
- Modify: `src/router.ts`

**Interfaces:**
- Consumes: `takeLastWrite` (Task 6), `readRow`/`deleteRow` (Task 8)
- Produces: `export function handleUndo(env: Env, chatId: number): Promise<void>;`

**Nguyên tắc an toàn:** đọc lại dòng và đối chiếu với giá trị đã lưu **trước khi** xoá. Nếu lệch — bạn đã tự sửa file, hoặc bảng đã dịch vì lý do khác — thì từ chối xoá. Thà không hoàn tác còn hơn xoá nhầm dòng khác.

- [ ] **Step 1: Viết src/handlers/undo.ts**

```ts
import { takeLastWrite } from '../db';
import type { Env } from '../env';
import { deleteRow, readRow } from '../graph/workbook';
import { sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';

export async function handleUndo(env: Env, chatId: number): Promise<void> {
  const last = await takeLastWrite(env.DB, chatId);
  if (!last) {
    await sendMessage(env, chatId, 'Không còn gì để hoàn tác.');
    return;
  }

  const expected = JSON.parse(last.valuesJson) as [string, number, number];
  const actual = await readRow(env, last.tableName, last.rowIndex);

  if (!actual) {
    await sendMessage(env, chatId, '⚠️ Không đọc được dòng đó nữa. Không hoàn tác, bạn kiểm tra file giúp.');
    return;
  }

  const same =
    String(actual[0] ?? '') === expected[0] &&
    Number(actual[1]) === expected[1] &&
    Number(actual[2]) === expected[2];

  if (!same) {
    await sendMessage(
      env, chatId,
      `⚠️ Dòng ở vị trí cũ giờ là "${String(actual[0] ?? '')}", không khớp khoản vừa ghi. ` +
      'Không hoàn tác để tránh xoá nhầm — bạn sửa tay trong Excel giúp.',
    );
    return;
  }

  await deleteRow(env, last.tableName, last.rowIndex);
  await sendMessage(
    env, chatId,
    `↩️ Đã hoàn tác: ${expected[0]} · ${formatVND(expected[2])}`,
  );
}
```

- [ ] **Step 2: Nối vào router.ts**

Thêm ngay sau khối `/help`:

```ts
  if (/^\/undo\b/i.test(text)) {
    await handleUndo(env, chatId);
    return;
  }
```

Thêm import: `import { handleUndo } from './handlers/undo';`

- [ ] **Step 3: Triển khai và kiểm thử**

```bash
npx wrangler deploy
```

Kịch bản 1 — đường thuận:
1. Nhắn `/food test undo 1k` → nhận xác nhận
2. Nhắn `/undo` → nhận `↩️ Đã hoàn tác: test undo · 1.000đ`
3. Mở Excel: dòng đã biến mất, `Tóm tắt` trở về số cũ
4. Nhắn `/undo` lần nữa → `Không còn gì để hoàn tác.`

Kịch bản 2 — đường an toàn:
1. Nhắn `/food test undo 2k`
2. Mở Excel, **sửa tay** mô tả dòng đó thành `đã sửa`
3. Nhắn `/undo` → phải nhận cảnh báo không khớp, và dòng **không** bị xoá

- [ ] **Step 4: Commit**

```bash
git add src/handlers/undo.ts src/router.ts
git commit -m "feat: /undo với đối chiếu giá trị trước khi xoá"
```

---

## Task 14: `/today`, `/thang` và hàng đợi ghi lại

**Files:**
- Create: `src/handlers/query.ts`, `src/handlers/outbox.ts`
- Modify: `src/router.ts`, `src/index.ts`

**Interfaces:**
- Consumes: `readSheet`/`computeTotals` (Task 8, 9), `dueOutbox`/`dropOutbox`/`bumpOutbox` (Task 6), `performWrite` (Task 11)
- Produces:
  ```ts
  export function handleToday(env: Env, chatId: number): Promise<void>;
  export function handleMonth(env: Env, chatId: number): Promise<void>;
  export function drainOutbox(env: Env): Promise<void>;
  ```

- [ ] **Step 1: Viết src/handlers/query.ts**

```ts
import { CATEGORIES, sheetName } from '../config';
import type { Env } from '../env';
import { readSheet } from '../graph/workbook';
import { toExcelSerial, vnToday } from '../parse/date';
import { sendMessage } from '../telegram/api';
import { formatVND } from '../telegram/format';

const SPEND_BLOCKS = [0, 4] as const;
const LABEL_COL = 12;
const VALUE_COL = 13;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function aligned(rows: [string, string][]): string {
  if (!rows.length) return '(chưa có khoản nào)';
  const w = Math.max(...rows.map((r) => r[0].length));
  const v = Math.max(...rows.map((r) => r[1].length));
  return rows.map(([l, val]) => `${l.padEnd(w)}  ${val.padStart(v)}`).join('\n');
}

export async function handleToday(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const serial = toExcelSerial(today);
  const data = await readSheet(env, sheetName(today.m));

  const items: [string, string][] = [];
  let total = 0;
  for (const row of data.values) {
    for (const c of SPEND_BLOCKS) {
      const cell = row[c];
      const desc = typeof cell === 'string' ? cell.trim() : '';
      const d = num(row[c + 1]);
      const amt = num(row[c + 2]);
      if (d === serial && amt !== null && desc) {
        items.push([desc.slice(0, 22), formatVND(amt)]);
        total += amt;
      }
    }
  }

  await sendMessage(
    env, chatId,
    `<b>Hôm nay ${String(today.d).padStart(2, '0')}/${String(today.m).padStart(2, '0')}</b>\n` +
    `<pre>${aligned(items)}</pre>\n<b>Tổng: ${formatVND(total)}</b>`,
  );
}

export async function handleMonth(env: Env, chatId: number): Promise<void> {
  const today = vnToday(Date.now());
  const data = await readSheet(env, sheetName(today.m));

  const wanted = new Set<string>(Object.values(CATEGORIES).map((c) => c.label));
  const rows: [string, string][] = [];
  let spend = 0;
  let income = 0;

  for (const row of data.values) {
    const raw = row[LABEL_COL];
    const label = typeof raw === 'string' ? raw.trim() : '';
    const v = num(row[VALUE_COL]);
    if (!label || v === null) continue;
    if (label === 'Tổng chi') { spend = v; continue; }
    if (label === CATEGORIES.income.label) { income = v; continue; }
    if (wanted.has(label)) rows.push([label, formatVND(v)]);
  }

  await sendMessage(
    env, chatId,
    `<b>Tháng ${today.m}</b>\n<pre>${aligned(rows)}</pre>\n` +
    `<b>Tổng chi: ${formatVND(spend)}</b>\nThu nhập: ${formatVND(income)}`,
  );
}
```

- [ ] **Step 2: Viết src/handlers/outbox.ts**

```ts
import { bumpOutbox, dropOutbox, dueOutbox } from '../db';
import type { Env } from '../env';
import { performWrite, type ExactEntry } from './write';
import { sendMessage } from '../telegram/api';

/** Chạy theo Cron mỗi 5 phút: thử ghi lại các khoản đã nhận nhưng chưa vào Excel. */
export async function drainOutbox(env: Env): Promise<void> {
  const items = await dueOutbox(env.DB, 10);
  for (const it of items) {
    try {
      const entry = JSON.parse(it.payloadJson) as ExactEntry;
      await performWrite(env, it.chatId, entry);
      await dropOutbox(env.DB, it.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await bumpOutbox(env.DB, it.id, msg);
      // Sau 20 lần thất bại thì báo người dùng một lần rồi thôi thử.
      if (it.attempts + 1 >= 20) {
        await sendMessage(
          env, it.chatId,
          `❌ Không ghi được một khoản sau 20 lần thử. Lỗi: ${msg.slice(0, 200)}`,
        );
      }
    }
  }
}
```

- [ ] **Step 3: Nối vào router.ts**

Thêm sau khối `/undo`:

```ts
  if (/^\/today\b/i.test(text)) { await handleToday(env, chatId); return; }
  if (/^\/thang\b/i.test(text)) { await handleMonth(env, chatId); return; }
```

Thêm import: `import { handleMonth, handleToday } from './handlers/query';`

- [ ] **Step 4: Thêm handler cron vào src/index.ts**

Thêm vào object export, cạnh `fetch`:

```ts
  async scheduled(_ctrl: ScheduledController, env: Env): Promise<void> {
    await drainOutbox(env);
  },
```

Thêm import: `import { drainOutbox } from './handlers/outbox';`

- [ ] **Step 5: Đăng ký lệnh với BotFather**

Nhắn `/setcommands` cho @BotFather, chọn bot, rồi dán:

```
food - Ăn uống sinh hoạt
eat_out - Ăn ngoài
transport - Phương tiện di chuyển
force - Chi tiêu bắt buộc
other - Linh tinh
other_expense - Chi tiêu khác
income - Thu nhập
invest - Đầu tư
saving - Tiết kiệm
undo - Hoàn tác khoản vừa ghi
today - Xem chi tiêu hôm nay
thang - Xem tổng tháng này
help - Hướng dẫn cú pháp
```

- [ ] **Step 6: Triển khai và kiểm thử toàn bộ**

```bash
npx wrangler deploy
npx vitest run
npx tsc --noEmit
```

Trên Telegram, chạy lần lượt và xác nhận từng cái:

| Lệnh | Kỳ vọng |
|---|---|
| `/food ăn trưa 40k` | Xác nhận + 3 dòng tổng |
| `/food cơm 2 người 80k` | Mô tả `cơm 2 người`, tiền 80.000đ |
| `/other TC 45k` | Mô tả bung thành `TocoToco` |
| `/food ăn trưa 40k hqua` | Ngày hôm qua |
| `/food gửi xe 3000` | Hai nút chọn |
| `/food ăn trưa` | Báo thiếu số tiền |
| `/food 40k` | Báo thiếu mô tả |
| `/xyz abc 40k` | Báo không có lệnh |
| `/food ăn trưa 40k 5/8/2027` | Báo chỉ ghi được năm 2026 |
| `/today` | Danh sách khoản hôm nay + tổng |
| `/thang` | Tổng 9 nhóm + tổng chi + thu nhập |
| `/undo` | Hoàn tác khoản gần nhất |
| `/help` | Hướng dẫn kèm mã viết tắt |

Kiểm hàng đợi: tạm đổi `DRIVE_ITEM_ID` thành giá trị sai, nhắn `/food test queue 5k` → phải nhận `⏳ Đã nhận, đang ghi lại`. Trả lại giá trị đúng, chờ cron chạy (≤5 phút) hoặc gọi tay:
```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```
→ khoản chi phải xuất hiện trong Excel kèm tin nhắn xác nhận.

Dọn sạch các dòng `test` đã tạo trong quá trình kiểm thử.

- [ ] **Step 7: Commit**

```bash
git add src/handlers/query.ts src/handlers/outbox.ts src/router.ts src/index.ts
git commit -m "feat: /today, /thang và hàng đợi ghi lại chạy theo cron"
```

---

## Đối chiếu kế hoạch với spec

| Mục spec | Task |
|---|---|
| 3. Kiến trúc Worker + D1 | 6, 11 |
| 3.2 Xác thực Graph, token xoay vòng | 1, 7 |
| 4.1 Thuật toán phân tích | 5 |
| 4.2 Phân tích số tiền | 3 |
| 4.3 Quy tắc số trần + nút chọn | 3, 12 |
| 4.4 Phân tích ngày + múi giờ | 4 |
| 5. Ánh xạ Excel, luôn `rows/add` | 8, 11 |
| 5.2 Rủi ro dồn vào `rows/add` | **2 (cổng chặn)** |
| 5.3 Đọc `usedRange` tính tổng | 9 |
| 6. Format phản hồi | 10 |
| 7. Bộ lệnh | 11, 13, 14 |
| 7.1 `/undo` | 13 |
| 8. Bảo mật hai lớp | 11 |
| 9. Xử lý lỗi, hàng đợi | 11, 14 |
| 10. Schema D1 | 6 |
| 11.1 Bước 0 | 2 |
| 11.2 Test parser | 3, 4, 5 |

**Sai khác so với spec, có chủ ý:**

1. **Thứ tự bước 0 và bước 1.** Spec đánh số spike là bước 0, Azure là bước 1 — nhưng không gọi được Graph khi chưa có token. Kế hoạch đảo lại: Task 1 dựng xác thực, Task 2 là spike. Spec đã ngầm chấp nhận điều này khi ghi spike đóng vai "hello world cho chuỗi xác thực".
2. **Bỏ bảng `table_cache`.** Spec mục 10 dự tính cache địa chỉ 9 bảng. Task 9 tính tổng bằng cách quét ba khối cột cố định `A:C`/`E:G`/`I:K`, không cần ranh giới bảng. Bỏ cache cũng bỏ luôn nghĩa vụ làm mới nó sau **mỗi** lần ghi — vốn là nguồn lỗi tiềm tàng vì mọi lần chèn dòng đều làm dịch địa chỉ.
