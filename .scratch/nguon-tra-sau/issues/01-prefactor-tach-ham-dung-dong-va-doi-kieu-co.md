# 01: Prefactor — tách hàm dựng dòng, đổi cờ thẻ thành nguồn nullable

**What to build:** Không có hành vi nào đổi. Bot chạy y hệt trước và sau: gõ `cc` vẫn ra
đúng tháng đích, ô mô tả vẫn đúng bằng chữ người dùng gõ, `/undo` vẫn xoá đúng dòng. Việc
của ticket này là dọn đường — tạo cái seam mà ticket 02 cần để test được tiền tố nguồn mà
không phải giả lập Graph, và đổi sẵn kiểu dữ liệu để ticket 02 chỉ còn việc thêm hai nguồn.

Ba việc, đều mechanical:

1. **Tách hàm dựng dòng.** Phần dựng ba ô `[mô tả, serial ngày, số tiền]` hiện nằm trong
   hàm ghi thật — nơi cần `Env` và Graph nên không seam nào với tới được. Tách nó thành
   một hàm thuần nhận khoản đã chốt số tiền. Hàm ghi thật gọi nó, và **bản lưu để `/undo`
   đối chiếu phải là cùng một mảng** với bản ghi vào Excel.

2. **Đổi kiểu cờ.** `isCard: boolean` biến mất, thay bằng `source: DeferredSource | null`.
   Tập nguồn lúc này **chỉ có `'cc'`** — hai nguồn kia là việc của ticket 02. `null` nghĩa
   là tiền rời tài khoản ngay; nó không phải thành viên của kiểu (xem `CONTEXT.md`, mục
   *Nguồn trả sau* và *Tiền tố nguồn*).

3. **Thay hai miếng vá tương thích.** Hai chỗ đang đọc bản ghi cũ — chỗ giải quyết khoản
   mơ hồ và chỗ rút hàng đợi ghi lại — hiện vá cho bản ghi tạo ra *trước khi có tính năng
   thẻ*, loại đã tuyệt chủng. Vứt lớp cũ, viết lớp mới: có `source` thì dùng, không thì
   suy từ `isCard` (`true` → `'cc'`, còn lại → `null`). **Không chồng ba lớp.**

Đồng thời nâng seam test tích hợp "từ tin nhắn tới bảng đích" để nó trả về **cả tên bảng
lẫn ô mô tả sẽ ghi**. Ở ticket này ô mô tả vẫn bằng đúng chữ người dùng gõ, nên các ca test
mới khẳng định "chưa có gì đổi" — đó là điều cần khẳng định.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Hàm dựng dòng là hàm thuần, gọi được không cần `Env`; hàm ghi thật gọi nó
- [ ] Bản lưu cho `/undo` đối chiếu và bản ghi vào Excel là **cùng một mảng**, không dựng hai lần
- [ ] `isCard` không còn tồn tại ở đâu trong mã nguồn; thay bằng `source: DeferredSource | null`
- [ ] `DeferredSource` lúc này chỉ có `'cc'`; `null` không phải thành viên của kiểu
- [ ] Bản ghi kiểu cũ trong hàng đợi ghi lại và khoản mơ hồ đang chờ vẫn đọc ra đúng nguồn
- [ ] Mỗi miếng vá tương thích kèm comment ghi rõ **khi nào xoá được**: sau khi deploy xong và hàng đợi ghi lại đã rỗng
- [ ] Lớp vá cho bản ghi "trước khi có tính năng thẻ" đã bị gỡ, không giữ lại
- [ ] Seam test tích hợp trả về cả bảng đích lẫn ô mô tả
- [ ] Toàn bộ test hiện có xanh; không ca nào phải đổi kỳ vọng ngoài việc đổi tên trường
- [ ] Hành vi quan sát được không đổi: mốc chốt 7, `cc` nhảy tháng đúng như trước, ô mô tả không có tiền tố
