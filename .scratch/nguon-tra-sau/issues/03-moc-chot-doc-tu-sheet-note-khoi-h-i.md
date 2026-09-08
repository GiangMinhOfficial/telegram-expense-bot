# 03: Mốc chốt đọc từ sheet `Note`, khối `H`–`I`

**What to build:** Đổi mốc chốt sao kê của bất kỳ nguồn nào bằng cách gõ trong Excel, không
cần deploy lại — đúng như bảng mã viết tắt đang làm. Khối cấu hình nằm ở hai cột `H` (token
nguồn) và `I` (ngày chốt) của sheet `Note`, **quét theo cột** chứ không đọc ô cố định, nên
đọc được ở bất kỳ dòng nào.

Ô `Note!B1` nghỉ hưu. Người dùng **đã tự dời** con số sang khối mới rồi — không viết code
đọc song song hai chỗ.

**Rủi ro chính của ticket này là bù trừ cột.** Vùng `usedRange` mà Graph trả về bắt đầu từ
ô có dữ liệu đầu tiên chứ không phải `A1`, nên chỉ số cột tuyệt đối bị lệch. Đúng lỗi đó đã
từng làm bảng mã viết tắt chết lặng trên production, và khối `H`–`I` phơi ra y hệt rủi ro
ấy. **Bắt buộc có ca test với `address` lệch** (kiểu `Note!E4:K12`), theo đúng ca đã đánh
dấu "HỒI QUY" trong bộ test sheet `Note`.

Kèm phần tài liệu và script đi cùng — chúng sai ngay khi khối `H`–`I` thay `Note!B1`:

- **`README.md`**: đổi tiêu đề mục "Quẹt thẻ tín dụng" → "Nguồn trả sau"; bảng ba token +
  mốc chốt; thay mọi nhắc tới `Note!B1` bằng khối `H`–`I`; **xoá câu "mọi dòng mang ngày
  của tháng trước chính là dòng thẻ"** — câu đó đúng khi chỉ có một nguồn, sai hẳn khi có ba.
- **Script kiểm tra sheet `Note`**: in ra mốc chốt của cả ba nguồn từ khối `H`–`I`.
- **Script đặt mốc chốt**: ghi khối `H`–`I` thay vì `A1:B1`, giữ nguyên tính chất **chỉ ghi
  khi ô đang trống**. Giữ script này chứ không xoá — nó là đường dựng lại file từ đầu.
- **Script nghiệm thu tính năng thẻ**: đọc mốc từ khối `H`–`I`.

**Cảnh báo:** đừng *chạy* các script đó để thử. Chạy bất kỳ script nào cũng làm chuỗi
refresh token phía bot chết, phải `/reauth` lại (xem `CONTEXT.md`, mục *Người giữ chuỗi*).
Sửa code là đủ; phần logic đọc khối `H`–`I` đã được test offline phủ.

**Blocked by:** 02 — phải có tập nguồn đóng thì mới có token để đối chiếu khi đọc khối `H`–`I`

**Status:** ready-for-agent

- [ ] Đọc mốc chốt của cả ba nguồn từ khối `H` (token) / `I` (ngày chốt), quét theo cột
- [ ] `Note!B1` không còn được đọc ở đâu cả
- [ ] Token lạ trong cột `H` bị bỏ qua, không làm hỏng gì
- [ ] Giá trị rỗng, không phải số nguyên, hoặc ngoài khoảng 1–28 → dùng mặc định của nguồn đó
- [ ] Nguồn thiếu hẳn khỏi khối → dùng mặc định của nguồn đó
- [ ] Sheet `Note` hỏng hoặc không đọc được → bot **vẫn ghi được**, dùng toàn bộ mặc định
- [ ] Có ca test với `address` lệch kiểu `Note!E4:K12` đọc đúng khối `H`–`I`
- [ ] `/help` in ra mốc chốt lấy từ khối `H`–`I`, không phải mặc định trong code
- [ ] `README.md`: mục đổi tên, bảng ba token, hết nhắc `Note!B1`
- [ ] `README.md`: câu "mọi dòng mang ngày của tháng trước chính là dòng thẻ" đã bị xoá
- [ ] Ba script hết nhắc `Note!B1`; script đặt mốc chốt ghi khối `H`–`I` và vẫn chỉ ghi khi ô trống
- [ ] Không script nào được chạy trong quá trình làm ticket này
