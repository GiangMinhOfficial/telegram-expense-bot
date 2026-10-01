# Bot ghi chi tiêu

Một bot Telegram ghi khoản chi vào workbook Excel trên OneDrive. Một người dùng,
một file, một chat. Tài liệu này là **từ điển thuật ngữ** — không phải spec, không
chứa chi tiết cài đặt.

## Xác thực OneDrive

**Chuỗi refresh token**:
Dãy token nối tiếp sinh ra từ một lần cấp quyền của Microsoft. Đổi một token lấy
access token sẽ vô hiệu nó và sinh ra token kế tiếp trong chuỗi.
_Tránh_: "refresh token" nói trống không khi đang bàn về nhiều bản sao.

**Người giữ chuỗi**:
Một nơi lưu giữ token hiện hành của chuỗi. Dự án này cố tình chấp nhận **hai**
người giữ trên cùng một chuỗi — D1 của Worker và `.dev.vars` của máy cá nhân —
nên mỗi bên dùng token là bên kia chết.

**Hết hiệu lực xác thực**:
Trạng thái quan sát được: bot không đổi được access token nữa. Có năm nguyên nhân
khác nhau cần năm cách sửa khác nhau — người dùng thu hồi quyền, token đã bị dùng
mất, client secret hết hạn (chỉ còn liên quan nếu app quay lại làm confidential client;
app hiện tại không có secret nào để hết hạn), kho token trống, hoặc chuỗi chưa từng đổi
được lần nào dù cấp ra hợp lệ — xem mục "Nguyên nhân thứ năm" bên dưới.
_Tránh_: "mất quyền ghi" khi dùng như một **chẩn đoán** — nó chỉ đúng cho một
trong năm nguyên nhân.

**code_verifier / code_challenge (PKCE)**:
Cặp giá trị Worker sinh ra thay cho client secret khi đổi authorization code lấy token
(RFC 7636). `code_verifier` là bí mật Worker giữ (cất tạm trong `pending_auth`, không bao
giờ hiện cho người dùng); `code_challenge` là băm SHA-256 của nó, gửi công khai lúc
`/authorize`. Microsoft đối chiếu hai giá trị này ở bước đổi code thay vì đòi client secret
— đây là cách một public client (không giữ được bí mật lâu dài) vẫn chứng minh được chính
mình là bên đã khởi tạo request.
_Tránh_: gọi `code_verifier` là "mã" trống không — dễ lẫn với authorization code do Microsoft
cấp qua redirect.

**Nguyên nhân thứ năm của "hết hiệu lực xác thực"**:
Chuỗi refresh token cấp ra bình thường, không ai thu hồi, kho token không trống, không có
client secret nào hết hạn (app là public client thật) — nhưng CHÍNH chuỗi đó chưa bao giờ
đổi được (`invalid_grant` mỗi lần gọi `exchangeRefreshToken`, dù access token cùng lô vẫn gọi
Graph 200 bình thường trong một giờ). Đo được với chuỗi do device code sinh ra cho tài khoản
Microsoft cá nhân này (ticket 06 ở `.scratch/reauth-token-chet/`) — không đổi lại được bất kể
Worker/vị trí, tốc độ lan truyền cấu hình Azure, hay độ trễ giữa lúc cấp và lúc đổi thử.
_Dấu vân tay_: access token gọi Graph vẫn 200 trong khi refresh token cùng grant đó trả
`invalid_grant` — khác bốn nguyên nhân kia (thu hồi quyền, token đã dùng mất, secret hết hạn,
kho trống) đều có dấu hiệu khác đi kèm. `/reauth` giờ dùng authorization_code + PKCE — luồng
đã biết chạy được cho tài khoản này — để tránh lặp lại nguyên nhân này.

**Thua cuộc đua**:
Tình huống một lượt chạy Worker đổi token xong thì phát hiện chuỗi đã tiến lên
bởi một lượt chạy khác. Không phải lỗi: lượt thua vứt token của mình đi và đi tiếp.

## Ghi khoản

**Khoản**:
Một dòng chi tiêu hoặc thu nhập người dùng gửi trong một tin nhắn.
_Tránh_: giao dịch, bản ghi.

**Tháng đích**:
Tháng mà khoản được ghi vào, đã tính cả quy tắc thẻ tín dụng. Khác với tháng phát
sinh khi quẹt thẻ sau ngày chốt sao kê.
_Tránh_: dùng "tháng" trống không khi hai tháng này có thể lệch nhau.

**Ngày chốt sao kê**:
Ngày trong tháng mà kỳ sao kê thẻ tín dụng khép lại. Quẹt sau ngày này thì trả
vào tháng sau.

**Hàng đợi ghi lại**:
Nơi giữ các khoản đã nhận của người dùng nhưng chưa ghi được vào Excel. Tồn tại
để một lỗi phía Graph không bao giờ làm mất khoản của người dùng.
_Tránh_: outbox, queue.

**Dọn bảng**:
Việc bot làm trên bảng vừa nhận khoản, sau khi đã gửi tin xác nhận: sắp các khoản theo
ngày tăng dần (cùng ngày giữ thứ tự ghi, dòng thiếu ngày nằm dưới) rồi bảo đảm đáy bảng
có đúng một **dòng trống**. Lỗi khi dọn chỉ gửi một tin cảnh báo, không làm khoản vào hàng
đợi ghi lại. `/undo` không dọn.
_Tránh_: "sắp xếp" trống không — dọn gồm cả việc xoá/thêm dòng trống.

**Dòng trống**:
Dòng của bảng chi tiêu có cả ba ô (mô tả, ngày, số tiền) rỗng. Dòng thiếu một phần — ví dụ
có mô tả mà chưa có số tiền — không phải dòng trống và không bao giờ bị xoá.
_Tránh_: "dòng thừa".

**Số tiền mơ hồ**:
Số tiền trong khoảng 1000–9999, không đoán được người dùng ghi nghìn hay đồng.
Bot hỏi lại thay vì đoán.
