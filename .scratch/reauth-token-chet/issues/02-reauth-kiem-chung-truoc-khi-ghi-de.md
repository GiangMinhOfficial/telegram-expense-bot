# 02: /reauth kiểm chứng chuỗi mới trước khi ghi đè người giữ chuỗi

**What to build:** Bấm nhầm `/reauth` không còn giết được bot. Khi cấp quyền xong, bot **đổi thử**
chuỗi vừa nhận trước khi cất nó đi. Đổi được thì mới ghi đè; không đổi được thì báo đúng lời
Microsoft và **giữ nguyên chuỗi cũ đang chạy**.

Hôm nay `/reauth` làm ngược lại: nhận token từ device code, ghi đè vô điều kiện lên D1, rồi trả
lời "đã cấp quyền lại, bot ghi được rồi". Nhưng chuỗi do device code sinh ra không đổi được
(`AADSTS70000`), nên câu trả lời đó là sai. Bot vẫn chạy đúng một giờ nhờ access token còn hạn,
rồi mới lộ ra là mất quyền — triệu chứng trễ khiến không ai nối được nguyên nhân với hậu quả.

Nguy hiểm nhất là ghi đè: một lần `/reauth` hoàn tất sẽ thay chuỗi đang sống bằng chuỗi chết.
Đường ghi này cố tình không có mệnh đề bảo vệ như đường xoay vòng, vì nó được thiết kế để dựng
lại kho khi kho trống. Ticket này thêm điều kiện đúng cho nó: không phải "có token cũ để so"
mà "token mới có dùng được không".

Sau ticket này, `/reauth` vẫn chưa chạy được (chuỗi device code vẫn chết — xem ticket 04), nhưng
nó thất bại **một cách trung thực và vô hại**. Đó là điều kiện tiên quyết để dám đụng vào đăng ký
app ở ticket 04.

**Blocked by:** 01

**Status:** ready-for-human

- [x] Cấp quyền xong mà chuỗi mới không đổi được thì kho token giữ nguyên giá trị cũ
- [x] Tin nhắn trả về nêu mã lỗi Microsoft, không tuyên bố thành công
- [x] Cấp quyền xong mà chuỗi mới đổi được thì ghi đè như cũ và báo thành công
- [x] Device code chỉ bị xoá khi đã xử lý xong, không xoá ở nhánh vừa hỏng vừa còn hạn
- [x] Có test cho cả hai nhánh, không cần gọi mạng thật
- [ ] Demo được: gửi `/reauth` hôm nay thì bot báo hỏng và vẫn ghi khoản bình thường sau đó

## Comments

**2026-09-02 — đã cài đặt.** `completeReauth` giờ đi qua `adoptChain`: đổi thử chuỗi vừa
nhận bằng `exchangeRefreshToken` (tách ra từ `getAccessToken`, dùng chung một đường gọi
endpoint token nên không trôi khỏi nhau — ticket 03 dùng lại chính hàm này). Đổi được thì
mới `saveToken`, và cất chuỗi SAU vòng xoay chứ không phải chuỗi device code trả về, vì
chính lần đổi thử đã vô hiệu nó. Đổi không được thì kho token không bị đụng tới và tin nhắn
in nguyên văn lời Microsoft.

Tám test ở `tests/reauth.test.ts`, giả lập fetch theo `grant_type` nên không gọi mạng thật.

`/code-review` bắt được hai chỗ nói dối còn sót, đã sửa: lời báo hỏng từng hứa "bot vẫn ghi
bình thường" kể cả khi kho token trống — đúng kiểu trấn an sai ticket này đang dẹp — nay
`reauthUnusable` nhận thêm `keptChain` và nói đúng từng trường hợp; và `exchangeRefreshToken`
từng lặng lẽ trả lại chính token vừa đem đi đổi khi Microsoft không xoay chuỗi, nên đường
`/reauth` có thể cất một chuỗi đã chết — nay trả `null` và nhánh nhận nuôi coi đó là hỏng.

Còn lại ô cuối — cần deploy rồi gửi `/reauth` thật trên Worker để xem bot báo hỏng và vẫn
ghi được khoản sau đó. Đó là việc của người, nên chuyển sang `ready-for-human`.
