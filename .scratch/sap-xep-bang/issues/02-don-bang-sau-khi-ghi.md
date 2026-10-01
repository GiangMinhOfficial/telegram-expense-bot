# 02: Dọn bảng sau khi ghi

**What to build:** Người dùng gửi `/food cơm trưa 40k 28/9` khi bảng đích đang có khoản
ngày muộn hơn. Bot trả lời xác nhận như hiện nay, rồi dọn bảng vừa nhận khoản:
các khoản xếp theo ngày tăng dần (cùng ngày giữ thứ tự ghi), dòng thiếu ngày nằm dưới, và đáy
bảng có đúng một dòng trống ngay trên dòng Tổng cộng. Dọn lỗi thì người dùng nhận một tin riêng:

`⚠️ Đã ghi khoản nhưng chưa sắp xếp được bảng <tên bảng>. Lần ghi sau sẽ tự xếp lại.`

Sắp bằng `sort/apply` của Graph (đã kiểm chứng ở `docs/SPIKE-SORT-RESULT.md`). Lệnh sắp không tự
đưa dòng trống về đáy khi bảng có dòng thiếu ngày, nên sau khi sắp bot đọc các dòng và chỉnh theo
một **kế hoạch dọn** — hàm thuần, test được không cần `Env`. Xem `../spec.md`.

Hai ràng buộc dễ sai:

- Bước dọn **không bao giờ ném lỗi ra ngoài** hàm ghi. Ném ra là khoản vào hàng đợi ghi lại và
  bị ghi trùng.
- Vá định dạng ngày theo chỉ số phải **xong trước** khi sắp.

**Blocked by:** 01 — sau ticket này chỉ số dòng lúc ghi không còn trỏ đúng dòng, `/undo` cũ sẽ từ chối mọi lần hoàn tác

**Status:** ready-for-agent

- [ ] Sau tin xác nhận, bảng vừa nhận khoản được sắp theo cột Ngày tăng dần
- [ ] Tin xác nhận gửi **trước** khi dọn; nội dung và các con số tổng không đổi
- [ ] Hàm thuần kế hoạch dọn: trả chỉ số dòng trống cần xoá (từ dưới lên) và cờ "cần thêm dòng trống"
- [ ] Dòng trống = cả ba ô rỗng; dòng thiếu một phần không bị xoá
- [ ] Dòng cuối là dòng trống → giữ nó, xoá mọi dòng trống khác
- [ ] Dòng cuối không trống → xoá mọi dòng trống, thêm một dòng trống ở đáy
- [ ] Bảng đã đúng hình dạng → không lệnh ghi nào ngoài lệnh sắp
- [ ] Lỗi ở bất kỳ bước dọn nào → một tin cảnh báo riêng, khoản không bị ghi lại, không vào hàng đợi ghi lại
- [ ] Khoản từ hàng đợi ghi lại cũng được dọn
- [ ] Chỉ dọn bảng vừa nhận khoản; `/undo` không dọn
- [ ] Test hàm thuần: đúng một dòng trống ở đáy, không có, nhiều, dòng trống nằm trên dòng thiếu ngày, dòng thiếu một phần, bảng rỗng
- [ ] `CONTEXT.md` thêm **Dọn bảng** và **Dòng trống**; `README.md` thêm một đoạn ngắn
- [ ] `npm test` và `npm run typecheck` qua
- [ ] Nghiệm thu: người dùng gửi một khoản lùi ngày vào file thật, mở Excel thấy đúng thứ tự và một dòng trống ở đáy; `/undo` xoá đúng khoản đó
