# 02: `spl` và `zlp` chạy được đầu-tới-cuối

**What to build:** Người dùng gõ `/other mua áo 250k spl` thì khoản rơi vào đúng tháng
tiền rời tài khoản theo mốc chốt 24 của SPayLater, ô mô tả trong file thành `[spl] mua áo`,
tin xác nhận hiện 🛍️, và `/help` liệt kê cả ba token kèm mốc chốt. Tương tự với `zlp`
(mốc 28). `cc` giữ nguyên hành vi cũ, chỉ thêm tiền tố `[cc] ` vào ô mô tả từ nay trở đi.

Mốc chốt ở ticket này lấy từ **mặc định khai báo trong code** — `cc` 7, `spl` 24, `zlp` 28,
đúng con số người dùng cần. Đọc mốc từ sheet `Note` là việc của ticket 03.

Tập nguồn là **đóng, khai báo trong code**, đặt cạnh bảng phân loại lệnh và theo đúng hình
dạng đó: mỗi nguồn mang nhãn hiển thị, emoji, và mốc chốt mặc định. Thêm ví mới là sửa code
+ deploy, không phải gõ một dòng vào Excel — đó là quyết định, không phải thiếu sót.

Tiền tố ghép ở **đúng một chỗ**: hàm dựng dòng tách ra ở ticket 01. Đây là tính chất mà
`docs/adr/0001-tien-to-nguon-trong-cot-mo-ta.md` dựa vào để khẳng định không đường phát lại
nào — hàng đợi ghi lại, khoản mơ hồ chờ trả lời — có thể ghép hai lần. Mô tả người dùng gõ
không bao giờ mang tiền tố, nên tin xác nhận và câu hỏi số tiền mơ hồ vẫn hiện chữ sạch.

Emoji là **Unicode thuần**, không dùng `custom_emoji` của Telegram (đòi Telegram Premium
hoặc username mua trên Fragment; chủ bot không có).

**Blocked by:** 01 — cần hàm dựng dòng làm seam test tiền tố, và cần kiểu `source` đã đổi xong

**Status:** ready-for-agent

- [ ] Tập nguồn đóng khai báo trong code: `cc`, `spl`, `zlp`, mỗi nguồn có nhãn, emoji, mốc mặc định
- [ ] Mốc mặc định: `cc` 7, `spl` 24, `zlp` 28
- [ ] Emoji: `cc` 💳, `spl` 🛍️, `zlp` 🔵 — Unicode thuần
- [ ] Ba token bóc khỏi câu **trước** khi quét số tiền, ngày, mô tả; đặt ở vị trí nào cũng được
- [ ] Token không lọt vào ô mô tả
- [ ] **Hai token nguồn trong một tin → báo lỗi**, không lấy token cuối, không đoán
- [ ] Ba token bị từ chối với `/income`, `/invest`, `/saving`
- [ ] `thẻ`, `ví`, `td` **không** phải token — `/other nạp thẻ 100k` vẫn là khoản bình thường
- [ ] Tháng đích tính bằng **cùng một công thức** cho cả ba nguồn, chỉ khác mốc chốt
- [ ] Tiêu **đúng ngày mốc** vẫn thuộc tháng phát sinh
- [ ] Ghi lùi ngày vẫn áp đúng quy tắc của nguồn
- [ ] Khoản tháng 12 vượt mốc bị từ chối kèm in lại đủ thông tin để chép tay, cho cả ba nguồn
- [ ] Ô mô tả trong file mang tiền tố `[cc] ` / `[spl] ` / `[zlp] `; không nguồn → không tiền tố
- [ ] Tiền tố ghép ở **đúng một chỗ** — hàm dựng dòng, không nơi nào khác
- [ ] Nhật ký D1 lưu mô tả **đã có** tiền tố
- [ ] Tin xác nhận có dòng **chỉ emoji, không chữ**; không nguồn → không có dòng đó
- [ ] Dòng emoji giữ hai hình dạng cũ: không nhảy tháng thì nói tháng trả, nhảy tháng thì nói cả ngày tiêu và tháng trả
- [ ] Tin xác nhận và câu hỏi số tiền mơ hồ hiện chữ người dùng gõ, **không** có tiền tố
- [ ] `/help` có mục "Nguồn trả sau", ba dòng token + mốc chốt, mốc lấy từ cấu hình đang chạy chứ không viết cứng
- [ ] `/undo` xoá đúng dòng khi dòng đó có tiền tố
