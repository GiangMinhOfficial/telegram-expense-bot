# 01: `/undo` tìm khoản theo nội dung thay vì vị trí dòng

**What to build:** `/undo` xoá đúng khoản vừa ghi kể cả khi dòng đó đã đổi chỗ trong bảng. Thay
vì đọc dòng ở chỉ số đã lưu rồi đối chiếu, bot đọc các dòng của bảng, tìm dòng khớp cả ba ô
(mô tả, serial ngày, số tiền) với bản đã lưu, và xoá dòng đó.

Đây là bước dọn đường cho ticket 02: khi bảng được sắp sau mỗi lần ghi, chỉ số dòng lúc ghi
không còn trỏ đúng dòng. Ticket này tự nó ship được — hành vi người dùng thấy không đổi khi bảng
chưa bị sắp, và tốt hơn khi người dùng tự chèn/xoá dòng phía trên.

Phép tìm dòng là một **hàm thuần** (nhận các dòng và bản đã lưu, trả chỉ số hoặc `null`) để test
được mà không cần `Env` hay Graph. Xem `../spec.md`, mục "`/undo`".

**Blocked by:** không

**Status:** ready-for-agent

- [ ] Đọc các dòng của bảng trong một lệnh gọi (`dataBodyRange`, chỉ `values`)
- [ ] Hàm thuần tìm dòng: khớp cả ba ô với bản đã lưu; nhiều dòng khớp → dòng **dưới cùng**; không khớp → `null`
- [ ] Ô đọc về là chuỗi rỗng không khớp nhầm với số `0`
- [ ] Khớp được dòng có tiền tố nguồn (`[cc] `, `[spl] `, `[zlp] `)
- [ ] Không dòng nào khớp → không xoá, báo người dùng sửa tay; câu báo không còn nói "dòng ở vị trí cũ"
- [ ] Không đọc được bảng → giữ câu báo "không đọc được" hiện có, không xoá
- [ ] Tin "↩️ Đã hoàn tác" giữ nguyên
- [ ] Cột `row_index` trong D1 giữ nguyên, không migration
- [ ] Test hàm thuần: dòng đã đổi chỗ, nhiều dòng giống nhau, không khớp, có tiền tố, ô rỗng
- [ ] `npm test` và `npm run typecheck` qua
