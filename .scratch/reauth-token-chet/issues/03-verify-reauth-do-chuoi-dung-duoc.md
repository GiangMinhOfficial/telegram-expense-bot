# 03: verify:reauth phải đo chuỗi dùng được, không chỉ đo xin được user code

**What to build:** Lệnh kiểm chứng cấp quyền lại chỉ báo "OK" khi nó đã thực sự đổi được một
chuỗi refresh token. Xin được user code không còn được tính là đạt.

Script hiện tại hỏi Microsoft xin một cặp mã, thấy có user code là in "app đã bật public client
flows, /reauth chạy được" rồi bỏ mã đó cho hết hạn. Đó chính là lời trấn an sai đã che lỗi này
suốt: xin mã vẫn chạy ngon lành trong khi chuỗi sinh ra từ mã đó không đổi được lần nào. Một lệnh
kiểm chứng khẳng định điều nó không đo là tệ hơn không có lệnh nào.

Phiên bản mới đi hết đường: xin mã, chờ người dùng đăng nhập, đổi mã lấy chuỗi, rồi **đổi thử
chuỗi đó**. Chỉ khi bước cuối xanh mới báo đạt. Hỏng ở đâu thì in nguyên văn mã lỗi Microsoft
kèm gợi ý sửa tương ứng, thay vì gộp mọi thất bại vào một lời khuyên duy nhất về Azure.

Dùng chung phép kiểm chứng với ticket 02 để hai nơi không trôi khỏi nhau.

**Blocked by:** 02

**Status:** ready-for-human

- [x] Script đi hết luồng đăng nhập rồi đổi thử chuỗi nhận được
- [x] Chỉ báo đạt khi đổi thử thành công; mã thoát khác 0 khi hỏng
- [x] In nguyên văn mã lỗi Microsoft, phân biệt được lỗi thiếu quyền với lỗi chuỗi không dùng được
- [x] Không in bí mật ra màn hình
- [ ] Chạy trên trạng thái hôm nay thì script BÁO HỎNG — đó là kết quả đúng, và là bằng chứng
      nó đo được thứ bản cũ bỏ sót

## Comments

**2026-09-02 — đã cài đặt.** `scripts/verify-reauth.mjs` viết lại hoàn toàn: xin mã xong không
còn dừng lại nữa mà tự hỏi lại Microsoft theo đúng nhịp RFC 8628 (`interval`, lùi thêm khi gặp
`slow_down`) cho tới khi người dùng đăng nhập xong, đổi mã lấy chuỗi, rồi **đổi thử chính chuỗi
đó** — bước cuối này mới là phép kiểm chứng có giá trị. Chỉ in "OK" khi bước đổi thử cuối thành
công; mọi nhánh hỏng đặt `process.exitCode = 1` (không gọi `process.exit()`, giữ nguyên lý do cũ:
thoát đột ngột lúc socket của fetch chưa đóng xong làm libuv abort trên Windows).

Buộc đổi thử dùng đúng một đường gọi endpoint token với `exchangeRefreshToken` trong
`src/graph/auth.ts` (client_id + client_secret + grant_type=refresh_token + scope, luôn gửi
client_secret). Repo không có cách import thẳng TS từ script `.mjs` thuần — Node ESM đòi đuôi
tường minh mà các file trong `src/` import lẫn nhau không ghi đuôi `.ts` — nên giữ trùng logic ở
đây thay vì import, giống cách `scripts/lib/dev-vars.mjs` đã làm với `getAccessToken` từ trước.
Sửa `exchangeRefreshToken` thì phải sửa cả chỗ này.

Lỗi phân hai nhóm theo đúng câu hỏi ticket đòi: `AADSTS70000`/`AADSTS90023` → "chuỗi không dùng
được"; `AADSTS7000218`/`AADSTS7000215`/nhắc tới "mobile" → "thiếu quyền/cấu hình" (mã lấy từ thực
nghiệm ở ticket 04). Không nhánh nào in `access_token`, `refresh_token`, `device_code`, hay
`client_secret` ra console — đã rà bằng `grep console\.` để xác nhận chỉ `user_code` (vốn phải
hiện cho người dùng gõ) và `verification_uri` được in.

Đã chạy thật bước 1 (xin mã) — Microsoft trả mã hợp lệ, script bắt đầu vòng hỏi lại đúng như
thiết kế. Không đi tiếp được vì bước 2 cần một người thật mở link và đăng nhập bằng tài khoản
Microsoft cá nhân — agent không làm thay được. Còn lại ô cuối: chạy `npm run verify:reauth`,
đăng nhập xong, xem script có báo HỎNG với `AADSTS70000`/`AADSTS90023` đúng như ticket 04 đã đo
hay không. Đó là việc của người, nên chuyển sang `ready-for-human`.
