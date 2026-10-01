# 01: Khoản bị ghi trùng khi có lỗi SAU lúc dòng đã vào Excel

**Phát hiện:** lúc review ticket 02 của `sap-xep-bang` (2026-10-02). Có từ trước ticket đó,
chưa tái hiện trên file thật — suy ra từ đọc code ở `src/router.ts`, `src/handlers/write.ts`,
`src/handlers/outbox.ts`.

## Hiện tượng

Người dùng gửi `/food cơm trưa 40k`. Dòng đã nằm trong bảng Excel, nhưng bước sau đó lỗi
(đọc tổng, vá định dạng ngày, ghi D1, hoặc gửi tin xác nhận không tới được Telegram).
Người dùng nhận `⏳ Đã nhận, đang ghi lại. Sẽ báo khi xong.` và vài phút sau cron ghi **thêm
một dòng thứ hai** y hệt. Người dùng thấy hai dòng `cơm trưa 40k` trong bảng, tổng tháng
cao hơn thật 40.000.

## Vì sao

`performWrite` ghi dòng trước rồi mới làm các bước còn lại. Bất kỳ lỗi nào ném ra từ các bước
còn lại đều bị `router.ts` coi là "chưa ghi được" và đẩy khoản vào hàng đợi ghi lại; cron lại
nối thêm một dòng. Cron cũng tự trùng thêm lần nữa nếu lần thử lại đó lại lỗi sau khi nối dòng
(mỗi lần thử là một dòng mới, tối đa 20 lần).

Ghi chú: ticket 02 đã bảo đảm bước **dọn bảng** không gây ra tình huống này. Ticket này là
các bước còn lại.

## Cần quyết định trước khi làm

Đây là chỗ cần chọn hướng, nên chưa `ready-for-agent`:

- Lỗi sau khi dòng đã vào Excel thì người dùng nên thấy gì? Hiện tại luôn là "đang ghi lại".
  Lựa chọn: báo "đã ghi nhưng chưa gửi được xác nhận / chưa lưu được /undo" (không đưa vào
  hàng đợi), hay vẫn thử lại nhưng bỏ qua bước nối dòng.
- `/undo` sau một khoản mà bước lưu con trỏ undo lỗi: chấp nhận không hoàn tác được, hay phải
  bảo đảm con trỏ được lưu?
- Khoản **thật sự** chưa vào file (lỗi ở chính lệnh nối dòng) vẫn phải vào hàng đợi như hiện nay.
  Lệnh nối dòng bị timeout mà Graph thực ra đã nhận thì không biết được — có chấp nhận rủi ro
  này không, hay kiểm tra lại bảng trước khi thử lại?

## Tiêu chí nghiệm thu (mức hộp đen)

- [ ] Dòng đã vào bảng rồi mà gửi xác nhận lỗi → bảng có đúng **một** dòng cho khoản đó, sau
      cả lần cron kế tiếp
- [ ] Dòng đã vào bảng rồi mà đọc tổng / vá ngày / ghi D1 lỗi → như trên
- [ ] Nối dòng lỗi thật (dòng chưa vào bảng) → vẫn vào hàng đợi, vẫn được ghi khi cron chạy
- [ ] Người dùng nhận tin phản ánh đúng sự thật: khoản đã ghi hay chưa
- [ ] Khoản từ hàng đợi và khoản từ nút chọn số tiền mơ hồ (`ambiguous.ts` không có bắt lỗi)
      cũng theo cùng quy tắc
- [ ] Có test cho phần quyết định "đã ghi hay chưa" ở dạng hàm thuần, không cần `Env`

**Status:** needs-triage

## Comments
