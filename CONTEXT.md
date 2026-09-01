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
Trạng thái quan sát được: bot không đổi được access token nữa. Có bốn nguyên nhân
khác nhau cần bốn cách sửa khác nhau — người dùng thu hồi quyền, token đã bị dùng
mất, client secret hết hạn, hoặc kho token trống.
_Tránh_: "mất quyền ghi" khi dùng như một **chẩn đoán** — nó chỉ đúng cho một
trong bốn nguyên nhân.

**Device code**:
Chuỗi bí mật Worker giữ để hỏi Microsoft xem người dùng đã đăng nhập xong chưa.
Không bao giờ hiện cho người dùng.

**User code**:
Chuỗi ngắn người dùng gõ vào `microsoft.com/devicelogin` trên điện thoại.
_Tránh_: gọi chung cả hai là "mã" — nhầm hai thứ này là hỏng cả luồng.

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

**Số tiền mơ hồ**:
Số tiền trong khoảng 1000–9999, không đoán được người dùng ghi nghìn hay đồng.
Bot hỏi lại thay vì đoán.
