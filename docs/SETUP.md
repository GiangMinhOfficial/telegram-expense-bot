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
| Redirect URI | *Web* → `http://localhost:8788/callback` |

Sau khi tạo:

1. Chép **Application (client) ID** → `MS_CLIENT_ID`
2. **Certificates & secrets** → **New client secret** → chép cột **Value** (không phải Secret ID) → `MS_CLIENT_SECRET`
   - Hạn dùng: `<điền>`. Bot **không dùng secret này nữa** (xem mục 4 trên và mục 6);
     chỉ còn `npm run auth` cần tới, nên hết hạn không làm bot ngừng ghi.
3. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → thêm:
   - `Files.ReadWrite`
   - `offline_access`
4. **Authentication** → **Allow public client flows** = **Yes**
   - Bắt buộc cho device code flow của `/reauth`. Thiếu nó Microsoft trả
     `AADSTS70002: ... client application must be marked as 'mobile'`.
   - Đánh đổi đã biết và đã chọn: từ lúc bật, Microsoft **không kiểm**
     `client_secret` ở endpoint token nữa. Refresh token tự nó thành chìa khoá.
   - Kiểm bằng: `npm run verify:reauth`

---

## 2. Lấy refresh token

```bash
npm run auth
```

Script hỏi client id + secret, in ra link đăng nhập, rồi in ra 4 dòng biến môi trường.
Chép chúng vào file `.dev.vars` ở thư mục gốc dự án.

Kỳ vọng dòng cuối: `File: Theo dõi chi tiêu.xlsx  (209521 bytes)` (kích thước có thể đổi theo thời gian).

Nếu báo `KHONG TIM THAY FILE`: kiểm lại hằng `FILE_PATH` trong script.
Thư mục đồng bộ cục bộ `D:\Documents\Onedrive` tương ứng gốc OneDrive,
nên đường dẫn trên cloud là `/Documents/TCCN/Theo dõi chi tiêu.xlsx`.

Chỉ chạy **một lần lúc dựng dự án**. Về sau mất quyền thì dùng `/reauth` (mục 6),
không phải mở lại laptop.

⚠️ Sau khi bật *Allow public client flows* ở mục 1, redirect URI kiểu **Web** có thể
không còn hợp lệ cho script này. Nếu `npm run auth` hỏng thì đường thay thế là `/reauth`,
và token nó in ra chính là thứ chép vào `.dev.vars`.

---

## 3. Tạo bot Telegram

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

## 4. Đăng ký danh sách lệnh với BotFather

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

## 5. Đăng ký webhook

Làm **sau khi** đã `npm run deploy` lần đầu và có URL Worker:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"<URL_WORKER>","secret_token":"<TELEGRAM_SECRET>","allowed_updates":["message","callback_query"]}'
```

Kỳ vọng: `{"ok":true,"result":true,...}`

---

## 6. Cấp quyền lại khi bot mất quyền ghi

Bot báo `🔑 Hết hiệu lực xác thực` nghĩa là refresh token đã chết. Sửa ngay trong chat:

1. Gửi `/reauth` → bot đưa một mã ngắn
2. Mở `microsoft.com/devicelogin`, nhập mã, đăng nhập, bấm đồng ý
3. Gửi `/reauth` **lần nữa** → bot lấy quyền về và in ra refresh token mới

Mã sống 15 phút. Quá hạn thì gửi `/reauth` lấy mã khác.

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

`/reauth` cố ý **không** nằm trong danh sách BotFather ở mục 4; nó chỉ có trong `/help`.

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

`0002_pending_device_code.sql` giữ device code giữa hai lần gửi `/reauth`.