# 04: Chuyển đăng ký app sang public client thật để /reauth dùng được

**What to build:** `/reauth` cấp ra chuỗi refresh token thực sự đổi được, nên người dùng cấp quyền
lại OneDrive ngay trong chat mà không cần mở trình duyệt hay chạy script.

Đăng ký app đang ở trạng thái lai: nó nhận luồng device code (public), nhưng endpoint token vẫn
đòi client secret (confidential). Hệ quả đo được ngày 2026-09-02 — cùng một tài khoản, cùng
endpoint:

- chuỗi sinh từ luồng authorization code: **417 ký tự**, đổi được khi gửi kèm secret
- chuỗi sinh từ luồng device code: **393 ký tự**, không đổi được bằng bất kỳ cách nào
  (`AADSTS70000` khi thiếu secret, `AADSTS90023` khi có secret)

Hai loại chuỗi khác nhau cả về hình dạng. Chừng nào app còn lai, `/reauth` còn cấp ra loại thứ hai.

Việc phải làm trên portal là việc của người, không phải của agent: đổi redirect URI từ nền tảng
"Web" sang "Mobile and desktop applications", xác nhận "Allow public client flows", xoá client
secret. Viết một wizard dẫn từng bước thay vì mô tả bằng văn xuôi. **Chưa ai nhìn portal** — suy
luận rằng redirect URI đang nằm dưới "Web" là suy ra từ việc luồng authorization code đòi secret.
Wizard phải cho người dùng dừng lại báo về nếu thấy khác.

Chuyển xong thì gỡ secret khỏi mã nguồn, khỏi Worker, và sửa test hồi quy của ticket 01 cho khớp
chiều ngược lại: gửi secret cho public client là lỗi.

Rủi ro phải nói trước: chuỗi 417 ký tự đang chạy được cấp cho danh tính confidential, nhiều khả
năng chết khi app đổi loại. Bot sẽ ngưng ghi trong lúc chuyển. Lưới an toàn của ticket 02 là thứ
đảm bảo bước cấp quyền lại cuối cùng không làm hỏng thêm.

**Blocked by:** 02

**Status:** ready-for-agent (phần agent làm được đã xong — xem Comments; 2 ô cuối chuyển sang ticket 06)

- [x] Wizard dẫn hết các bước trên portal, mỗi chặng một việc, có cổng xác nhận trước bước không
      lùi được (xoá secret)
- [x] Wizard dừng và báo về nếu trạng thái portal khác với giả định
- [x] Sau khi chuyển: đổi chuỗi KHÔNG kèm secret → thành công (đo bằng access_token gọi Graph
      thành công qua device code); CÓ kèm secret → `AADSTS90023` (đo được lúc 13:47:40Z, xem Comments)
- [x] Secret đã gỡ khỏi mã nguồn và khỏi Worker; test hồi quy đổi chiều và xanh
- [ ] Chuỗi mới do device code sinh ra đã nằm trong kho token của bot — **không đạt được, xem
      Comments: device code không đổi lại được cho tài khoản này. Chuyển sang ticket 06.**
- [ ] Demo được: gửi `/reauth` trong chat, làm theo hướng dẫn, rồi ghi một khoản thành công —
      **chuyển sang ticket 06**

## Comments

**2026-09-02 — đã làm xong phần code + portal, phát hiện vấn đề sâu hơn khi demo thật.**

Wizard (`.scratch/reauth-token-chet/wizard-public-client.sh`, không commit vì chỉ dùng một lần) đã
dẫn xong: redirect URI chuyển sang "Mobile and desktop applications", "Allow public client flows"
xác nhận Yes, client secret đã xoá khỏi Azure. Không gặp trạng thái khác giả định nên không cần
dừng giữa chừng.

Gỡ `MS_CLIENT_SECRET` khỏi `src/env.ts`, `src/graph/auth.ts`, `scripts/verify-reauth.mjs`,
`scripts/lib/dev-vars.mjs` (dùng chung bởi phần lớn `scripts/*.mjs`), `wrangler.toml`. Đảo chiều
test hồi quy của ticket 01 (`tests/auth.test.ts`): giờ khẳng định KHÔNG gửi secret, cộng test mới
khẳng định gửi secret là lỗi. `npx wrangler secret delete MS_CLIENT_SECRET` trên Worker thật, sau
đó deploy. `tsc --noEmit` sạch, 231 test xanh. Tất cả đã commit (`e22a252`).

Demo thật lộ ra vấn đề KHÔNG nằm trong dự đoán ban đầu của ticket này: device code flow không đổi
lại được (`AADSTS70000`) cho tài khoản Microsoft cá nhân đang dùng, đo 5 lần liên tiếp, đã loại trừ
Worker/vị trí, tốc độ lan truyền cấu hình, độ trễ đổi lại, và thiếu consent (access token vẫn gọi
Graph thành công). Nghiêm trọng hơn: việc gỡ secret khỏi mã nguồn (đúng theo ticket này) vô tình
giết luôn chuỗi 417 ký tự đang chạy — nó được cấp cho danh tính confidential, tự nó đòi secret vĩnh
viễn để đổi (`AADSTS70002` khi đổi không kèm secret, đo 15:42:49Z), mà secret thì không thể phục
hồi (đã xoá khỏi Azure). **Bot đang ngưng ghi.** Toàn bộ bằng chứng, correlation ID, và bản thiết kế
lại (chuyển `/reauth` sang authorization_code + PKCE) đã ghi ở ticket 06 — đó là ticket khẩn, nên
làm ngay.
