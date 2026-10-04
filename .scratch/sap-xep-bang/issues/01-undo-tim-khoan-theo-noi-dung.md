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

- [x] Đọc các dòng của bảng trong một lệnh gọi (`dataBodyRange`, chỉ `values`)
- [x] Hàm thuần tìm dòng: khớp cả ba ô với bản đã lưu; nhiều dòng khớp → dòng **dưới cùng**; không khớp → `null`
- [x] Ô đọc về là chuỗi rỗng không khớp nhầm với số `0`
- [x] Khớp được dòng có tiền tố nguồn (`[cc] `, `[spl] `, `[zlp] `)
- [x] Không dòng nào khớp → không xoá, báo người dùng sửa tay; câu báo không còn nói "dòng ở vị trí cũ"
- [x] Không đọc được bảng → giữ câu báo "không đọc được" hiện có, không xoá
- [x] Tin "↩️ Đã hoàn tác" giữ nguyên
- [x] Cột `row_index` trong D1 giữ nguyên, không migration
- [x] Test hàm thuần: dòng đã đổi chỗ, nhiều dòng giống nhau, không khớp, có tiền tố, ô rỗng
- [x] `npm test` và `npm run typecheck` qua

## Comments

Đã làm xong, commit trên `feat/sap-xep-bang` (`feat: /undo tìm khoản theo nội dung…` và
`refactor: đặt tên RowValues…`). Cả 10 ô ở trên đã tick; `npm test` (309 test) và
`npm run typecheck` qua. Chưa chạy với file Excel thật.

- Hàm thuần `findRowIndex` ở `src/graph/find-row.ts`; đọc bảng bằng `readTableRows`
  (`dataBodyRange?$select=values`) ở `src/graph/workbook.ts`; `readRow` đã bỏ vì không còn ai dùng.
- Hai ô số (ngày, số tiền) so chặt theo kiểu. Ô mô tả đổi sang chuỗi trước khi so, vì mô tả toàn
  chữ số ("100") được Excel đọc về là số.
- Tin báo không khớp nay nêu cả khoản (`mô tả · số tiền`) để người dùng biết cần sửa dòng nào.
- Kiểu `RowValues` (`src/graph/sheet.ts`) đặt tên cho ba ô của một khoản.
