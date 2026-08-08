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
   - Hạn dùng: `<điền>` — **hết hạn là bot ngừng ghi được**, phải tạo secret mới và nạp lại
3. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → thêm:
   - `Files.ReadWrite`
   - `offline_access`

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

## Bí mật cần nạp cho Worker

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_REFRESH_TOKEN
npx wrangler secret put DRIVE_ITEM_ID
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_SECRET
npx wrangler secret put ALLOWED_CHAT_ID
```

`.dev.vars` chỉ dùng cho chạy local và cho `scripts/spike.mjs`. File này **nằm trong `.gitignore`**, không bao giờ commit.
