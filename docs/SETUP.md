# Thiết lập thủ công

Các bước dưới đây **không tự động hoá được** — phải làm trên trình duyệt / trong app Telegram.
Ghi lại ngày làm để sau còn biết lúc nào cần gia hạn.

---

## 1. Đăng ký app trên Azure

Ngày làm: `<điền>`

Tại https://portal.azure.com → **App registrations** → **New registration**:

| Trường | Giá trị |
|---|---|
| Name | `telegram-expense-bot` |
| Supported account types | **Personal Microsoft accounts only** |
| Redirect URI | *Mobile and desktop applications* → `https://<URL_WORKER>/oauth/callback` |

`<URL_WORKER>` chỉ biết được sau khi `npm run deploy` lần đầu (mục 4) — đăng ký app trước để
lấy `MS_CLIENT_ID`, deploy xong quay lại **Authentication** thêm redirect URI này cũng được.

App là **public client thật** — không tạo client secret, không có gì để hết hạn. Redirect URI
phải đăng ký đúng nền tảng **"Mobile and desktop applications"**, KHÔNG phải "Web": nền tảng
quyết định loại client, không phải công tắc "Allow public client flows" (xem `CONTEXT.md`).

Sau khi tạo:

1. Chép **Application (client) ID** → `MS_CLIENT_ID`
2. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → thêm:
   - `Files.ReadWrite`
   - `offline_access`
3. **Authentication** → **Allow public client flows** = **Yes**

---

## 2. Tạo bot Telegram

Ngày làm: `<điền>`

1. Nhắn [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên và username
2. Chép token → `TELEGRAM_BOT_TOKEN`
3. Tự sinh một chuỗi ngẫu nhiên ≥32 ký tự → `TELEGRAM_SECRET`
   ```bash
   node -e "console.log(crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,''))"
   ```
4. Lấy Telegram user id của bạn → `ALLOWED_CHAT_ID`:
   - Nhắn một tin bất kỳ cho bot vừa tạo
   - Mở `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Đọc `result[0].message.from.id`

---

## 3. Đăng ký danh sách lệnh với BotFather

Nhắn `/setcommands` → chọn bot → dán:

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

---

## 4. Đăng ký webhook

Làm **sau khi** đã `npm run deploy` lần đầu và có URL Worker:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<URL_WORKER>","secret_token":"<TELEGRAM_SECRET>","allowed_updates":["message","callback_query"]}'
```

Kỳ vọng: `{"ok":true,"result":true,...}`

---

## 5. Cấp quyền — lần đầu dựng kho token, và mỗi lần bot mất quyền ghi

Cùng một lệnh cho cả hai việc: dựng kho token lúc mới deploy (kho trống) và cấp lại khi bot
báo `🔑 Hết hiệu lực xác thực` (refresh token đã chết). Không cần mở laptop, làm thẳng trong chat:

1. Gửi `/reauth` → bot trả một link đăng nhập Microsoft
2. Bấm link, đăng nhập, bấm đồng ý
3. Microsoft tự redirect trình duyệt về Worker (`/oauth/callback`) — bot tự đổi lấy quyền,
   **không cần gửi lại `/reauth`**

Link sống 15 phút. Quá hạn thì gửi `/reauth` lấy link khác.

**Chép refresh token bot in ra vào `.dev.vars`.** D1 của Worker và `.dev.vars` là hai
người giữ trên **cùng một chuỗi token** (xem `CONTEXT.md`) — bên nào đem token đi đổi
trước thì bên kia chết ngay.

| Việc vừa làm              | Hậu quả                                       |
| ------------------------- | --------------------------------------------- |
| Chạy bất kỳ `scripts/*.mjs` | Token phía bot chết → phải `/reauth`         |
| Bot ghi một khoản          | Token trong `.dev.vars` chết → `invalid_grant` |

Nghĩa là mỗi lần `/reauth` mua được **đúng một** lượt chạy script. Cách thoát hẳn là
đăng ký một app Azure riêng cho `scripts/` — đã cân nhắc, tạm chưa làm.

Khoản chi gõ vào đúng lúc mất quyền thì **không được ghi và không vào hàng đợi** —
nhập lại sau khi `/reauth` xong.

`/reauth` nằm trong danh sách lệnh ở mục 3, nên nó hiện trong menu của Telegram.

---

## Bí mật cần nạp cho Worker

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put DRIVE_ITEM_ID
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET
npx wrangler secret put ALLOWED_CHAT_ID
```

Hoặc nạp cả loạt từ `.dev.vars`: `node scripts/push-secrets.mjs --target=real`

`MS_CLIENT_SECRET` và `MS_REFRESH_TOKEN` **không còn là secret của Worker**. Nếu đã
từng nạp thì gỡ đi cho sạch:

```bash
npx wrangler secret delete MS_CLIENT_SECRET
npx wrangler secret delete MS_REFRESH_TOKEN
```

`.dev.vars` chỉ dùng cho chạy local và cho `scripts/spike.mjs`. File này **nằm trong `.gitignore`**, không bao giờ commit.


---

## Migration D1

```bash
npx wrangler d1 migrations apply expense-bot --remote
```

`0003_pending_auth.sql` giữ `code_verifier` + `state` (PKCE) giữa lúc gửi `/reauth` và lúc
Microsoft redirect về `/oauth/callback` — thay cho `0002_pending_device_code.sql` (device code,
đã bỏ, xem ticket 06 ở `.scratch/reauth-token-chet/`).