# 01: Chốt bản sửa client_secret vào lịch sử git

**What to build:** Bot đổi được chuỗi refresh token trở lại, và lý do phải gửi `client_secret`
được khoá lại bằng một test hồi quy thay vì bằng trí nhớ.

Bản sửa đã áp và đã deploy trong lúc chẩn đoán, nhưng còn nằm ngoài lịch sử git. Ticket này
đưa nó vào, kèm test hồi quy đã viết. Nếu không chốt, một lần `git checkout` là mất, và giả
định sai cũ quay lại.

Bối cảnh đo được ngày 2026-09-02: bật "Allow public client flows" chỉ **mở thêm** luồng device
code, nó KHÔNG biến đăng ký app thành public client. Endpoint token vẫn trả
`AADSTS70002: must include a 'client_secret'` khi thiếu secret. Commit bỏ secret đi đã dựa trên
giả định ngược lại, và đó là thứ làm bot mất khả năng đổi token.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Bản sửa nằm trong một commit trên nhánh đang làm, kèm test hồi quy
- [ ] Commit message nói rõ giả định nào đã sai và đo bằng mã lỗi nào
- [ ] Toàn bộ test xanh, `tsc --noEmit` sạch
- [ ] Danh sách secret của Worker trong cấu hình khớp với secret thực sự đã nạp
- [ ] Xác nhận trên Worker thật: ép kho token không còn access token, gửi một lệnh chỉ-đọc
      cho bot, nhận về số liệu chứ không phải thông báo hết hiệu lực xác thực
