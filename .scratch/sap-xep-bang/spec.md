# Spec: Dọn bảng sau khi ghi (sắp theo ngày + một dòng trống ở đáy)

Status: ready-for-agent

## Problem Statement

Bot nối khoản mới vào **cuối** bảng. Hai hệ quả khi mở file:

1. **Khoản không theo thứ tự ngày.** Ghi lùi ngày, hay hàng đợi ghi lại nhả khoản muộn, là dòng
   nằm lệch chỗ.
2. **Dòng trống nằm giữa bảng.** Mỗi bảng trong file có sẵn một dòng trống ở đáy để gõ tay. Bot
   nối khoản xuống dưới dòng đó, nên dòng trống trôi lên giữa và đáy bảng không còn chỗ gõ.

## Solution

Sau mỗi lần ghi, bot **dọn bảng** vừa nhận khoản: sắp các dòng theo ngày tăng dần, rồi bảo đảm
đáy bảng có đúng một dòng trống. Bot trả lời xác nhận **trước**, dọn **sau**; dọn lỗi thì gửi
một tin cảnh báo riêng. `/undo` tìm khoản theo nội dung vì dòng không còn nằm ở vị trí lúc ghi.

Bảng sau khi dọn, từ trên xuống:

1. Khoản có ngày, tăng dần; cùng ngày thì khoản ghi trước nằm trên.
2. Dòng không có ngày (gõ tay thiếu ngày, hoặc ô ngày là chữ) — giữ nguyên nội dung.
3. Đúng một dòng trống.
4. Dòng Tổng cộng.

## User Stories

1. Là người mở file Excel, tôi muốn các khoản trong bảng xếp theo ngày tăng dần, để đọc bảng như
   một cuốn sổ.
2. Là người mở file Excel, tôi muốn các khoản cùng ngày giữ thứ tự tôi đã ghi, để không bị xáo.
3. Là người mở file Excel, tôi muốn đáy mỗi bảng luôn có đúng một dòng trống, để có chỗ gõ tay.
4. Là người gõ tay vào file, tôi muốn dòng tôi gõ lệch ngày được xếp lại ở lần bot ghi kế tiếp
   vào bảng đó, để không phải tự kéo dòng.
5. Là người gõ tay vào file, tôi muốn dòng tôi gõ thiếu ngày không bị bot sửa hay xoá, chỉ nằm
   dưới các khoản có ngày.
6. Là người gõ tay vào file, tôi muốn dòng gõ dở (có mô tả, chưa có số tiền) không bị coi là
   dòng trống, để bot không xoá mất.
7. Là chủ file Excel, tôi muốn bot xoá bớt khi bảng có nhiều dòng trống và thêm khi không có
   dòng nào, để bảng nào cũng về cùng một hình dạng.
8. Là người dùng bot, tôi muốn tin xác nhận tới nhanh như hiện nay, để việc dọn bảng không làm
   tôi phải chờ.
9. Là người dùng bot, tôi muốn nhận một tin cảnh báo khi khoản đã ghi mà bảng chưa dọn được, để
   biết bảng đang tạm lệch.
10. Là người dùng bot, tôi muốn khoản không bị ghi trùng khi việc dọn bảng lỗi.
11. Là người dùng bot, tôi muốn `/undo` xoá đúng khoản vừa ghi dù nó đã đổi chỗ.
12. Là người dùng bot, tôi muốn `/undo` vẫn từ chối khi không còn dòng nào khớp khoản vừa ghi,
    để không xoá nhầm.
13. Là người dùng bot, tôi muốn khoản từ hàng đợi ghi lại cũng được dọn như khoản ghi trực tiếp.
14. Là chủ file Excel, tôi muốn bot chỉ dọn bảng vừa nhận khoản, để các bảng khác không bị đụng.

## Implementation Decisions

Bằng chứng cho các quyết định về Graph nằm ở `docs/SPIKE-SORT-RESULT.md`.

### Sắp xếp

- Dùng `POST tables/{tên}/sort/apply` với `fields: [{ key: 1, ascending: true }]`. Đã kiểm
  chứng: ổn định (cùng ngày giữ thứ tự), định dạng ô đi theo dòng, công thức `Tóm tắt` không hỏng.
- Không gọi `sort/clear`. Trạng thái sắp bám lại trên bảng là vô hại và tiết kiệm một lệnh gọi.
- Lệnh vá định dạng ngày (`fixDateFormat`, theo chỉ số) **phải xong trước** khi sắp — sau khi
  sắp, chỉ số đó trỏ sang dòng khác.

### Một dòng trống ở đáy

- Lệnh sắp **không** tự đưa dòng trống về đáy khi bảng có dòng thiếu ngày (với Excel hai loại
  bằng nhau). Nên sau khi sắp, bot đọc các dòng của bảng và chỉnh theo một **kế hoạch dọn**.
- **Dòng trống** = cả ba ô rỗng (chuỗi rỗng hoặc `null`). Dòng thiếu một phần không phải dòng trống.
- Kế hoạch dọn là một **hàm thuần**: nhận các dòng của bảng, trả về danh sách chỉ số dòng cần
  xoá (đã xếp từ dưới lên) và cờ "cần thêm dòng trống". Quy tắc: dòng cuối là dòng trống thì giữ
  nó, xoá mọi dòng trống khác; dòng cuối không trống thì xoá mọi dòng trống và thêm một dòng.
- Xoá từ dưới lên để chỉ số không trôi. Thêm dòng trống bằng `rows/add` với `[null, null, null]`.
- Trường hợp thường gặp (bảng có sẵn một dòng trống, không có dòng thiếu ngày): kế hoạch rỗng,
  việc dọn tốn đúng hai lệnh gọi (sắp + đọc).

### Thứ tự trong một lần ghi

- Ghi dòng → vá định dạng, đọc tổng, ghi D1 (song song như hiện nay) → **gửi tin xác nhận** →
  dọn bảng.
- Tổng trong tin xác nhận đọc **trước** khi dọn. Không đọc tổng sau lệnh xoá: Graph có thể trả
  số cũ (FAIL 7 của spike).
- Dọn bảng **không bao giờ ném lỗi ra ngoài** hàm ghi. Ném ra là khoản bị đẩy vào hàng đợi ghi
  lại (hoặc bị hàng đợi tính là thất bại) và ghi trùng. Mọi lỗi của bước dọn bị bắt lại và đổi
  thành một tin cảnh báo.
- Tin cảnh báo: `⚠️ Đã ghi khoản nhưng chưa sắp xếp được bảng <tên bảng>. Lần ghi sau sẽ tự xếp lại.`
- Chỉ dọn bảng vừa nhận khoản. Không dọn khi `/undo`.

### `/undo`

- Không dùng chỉ số dòng đã lưu. Đọc các dòng của bảng, tìm dòng khớp cả ba ô với bản đã lưu
  (`valuesJson`), xoá dòng đó. Nhiều dòng khớp thì xoá dòng **dưới cùng** — các dòng giống hệt
  nhau thì xoá dòng nào cũng cho cùng kết quả.
- Phép tìm dòng là một **hàm thuần**: nhận các dòng và bản đã lưu, trả chỉ số hoặc `null`.
- Không dòng nào khớp → không xoá, báo người dùng sửa tay (giữ tinh thần "thà không hoàn tác còn
  hơn xoá nhầm"). Câu báo đổi cho khớp: không còn "dòng ở vị trí cũ".
- Cột `row_index` trong D1 giữ nguyên, không migration; chỉ là không còn được đọc để xoá.

### Tài liệu đi kèm commit

- `CONTEXT.md`: thêm thuật ngữ **Dọn bảng** và **Dòng trống** vào mục "Ghi khoản".
- `README.md`: một đoạn ngắn về việc bảng tự sắp và dòng trống ở đáy.

## Testing Decisions

Giữ lựa chọn của codebase: test **hàm thuần**, không dựng `Env`, không giả lập Graph.

- **Kế hoạch dọn**: một dòng trống ở đáy → không làm gì; không có dòng trống → thêm; nhiều dòng
  trống → xoá bớt, giữ dòng đáy; dòng trống nằm trên dòng thiếu ngày → xoá và thêm lại ở đáy;
  dòng thiếu một phần không bị xoá; chỉ số xoá xếp từ dưới lên; bảng rỗng.
- **Tìm dòng cho `/undo`**: khớp khi dòng đã đổi chỗ; nhiều dòng giống nhau → dòng dưới cùng;
  không khớp → `null`; mô tả có tiền tố nguồn; ô đọc về là chuỗi rỗng không khớp nhầm.

Không test đường gọi Graph thật — đã kiểm chứng bằng spike. Nghiệm thu cuối: người dùng gửi một
khoản lùi ngày vào file thật rồi mở Excel xem.

## Out of Scope

- **Dọn các bảng khác** của tháng, hay dọn một lượt toàn bộ file. Bảng cũ tự được dọn ở lần ghi
  kế tiếp vào nó.
- **Dọn khi người dùng gõ tay.** Bot không biết lúc file bị sửa.
- **Chống hai lần dọn chồng nhau** khi gửi hai khoản liền nhau vào cùng bảng. Tệ nhất là bảng
  lệch thứ tự hoặc thừa một dòng trống tới lần ghi kế tiếp; không mất khoản.
- **Đưa cảnh báo vào tin xác nhận.** Người dùng chọn trả lời trước, dọn sau.

## Further Notes

- Thiết kế đã qua một vòng grilling; các quyết định trên là kết quả đã chốt.
- Đang mở file trong Excel lúc bot ghi thì các dòng nhảy chỗ; đang gõ dở một ô trong bảng đó thì
  lệnh sắp có thể bị từ chối và người dùng nhận tin cảnh báo.
- Từ vựng theo `CONTEXT.md`: **khoản**, **hàng đợi ghi lại**; thêm mới **dọn bảng**, **dòng trống**.
