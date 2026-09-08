# Spec: Nguồn trả sau (cc / spl / zlp)

Status: ready-for-agent

## Problem Statement

Bot hiện chỉ biết đúng một nguồn trả sau: thẻ tín dụng, đánh dấu bằng token `cc`, với
một ngày chốt sao kê duy nhất. Người dùng còn tiêu bằng hai ví trả sau khác — SPayLater
và ví trả sau ZaloPay — mỗi ví một ngày chốt riêng. Hai hệ quả:

1. **Khoản ví trả sau rơi sai tháng đích.** Gõ không có `cc` thì bot ghi vào tháng phát
   sinh, trong khi tiền thật sự rời tài khoản ở tháng khác. Gõ `cc` thì đúng cơ chế
   nhưng sai ngày chốt (7 thay vì 24 hoặc 28). Sheet `Tóm tắt` là một dòng tiền chạy
   liên tục, nên sai tháng đích là sai số dư của mọi tháng sau đó.
2. **Mở file ra không biết khoản nào trả bằng nguồn nào.** File chỉ có `[mô tả, ngày,
   số tiền]`; nguồn không để lại dấu vết. Với một nguồn thì còn suy ra được ("dòng mang
   ngày của tháng trước là dòng thẻ"); với ba nguồn thì hết suy.

## Solution

Tổng quát hoá cờ `cc` thành **nguồn trả sau** — một tập đóng gồm ba giá trị, mỗi giá trị
có ngày chốt sao kê riêng và một emoji riêng.

Người dùng thêm đúng một token vào tin nhắn: `cc`, `spl`, hoặc `zlp`. Bot chọn ngày chốt
của nguồn đó, tính tháng đích bằng **cùng một công thức** đang dùng cho thẻ, và ghép
**tiền tố nguồn** (`[cc] `, `[spl] `, `[zlp] `) vào đầu ô mô tả khi ghi. Không token =
tiền rời tài khoản ngay = không tiền tố.

Tin xác nhận hiện emoji của nguồn. `/help` liệt kê cả ba token kèm ngày chốt.

## User Stories

1. Là người ghi chi tiêu, tôi muốn gõ `spl` vào tin nhắn, để khoản SPayLater rơi vào
   đúng tháng tiền rời tài khoản.
2. Là người ghi chi tiêu, tôi muốn gõ `zlp` vào tin nhắn, để khoản ví trả sau ZaloPay
   rơi vào đúng tháng tiền rời tài khoản.
3. Là người ghi chi tiêu, tôi muốn `cc` giữ nguyên hành vi cũ, để thói quen gõ hàng ngày
   và mọi khoản đã ghi không bị ảnh hưởng.
4. Là người ghi chi tiêu, tôi muốn đặt token ở bất kỳ vị trí nào trong câu, để không
   phải nhớ thứ tự.
5. Là người ghi chi tiêu, tôi muốn token bị bóc khỏi mô tả, để ô mô tả không dính chữ
   `spl` thừa.
6. Là người ghi chi tiêu, tôi muốn mỗi nguồn dùng ngày chốt của riêng nó, để khoản
   SPayLater ngày 20 nằm ở tháng phát sinh còn khoản thẻ ngày 20 nhảy sang tháng sau.
7. Là người ghi chi tiêu, tôi muốn khoản tiêu **đúng ngày chốt** vẫn thuộc tháng phát
   sinh, vì kỳ sao kê đóng vào hết ngày đó chứ không phải đầu ngày đó.
8. Là người ghi chi tiêu, tôi muốn ghi lùi ngày vẫn áp đúng quy tắc nguồn, để khoản quên
   ghi mấy hôm trước không rơi sai tháng.
9. Là người ghi chi tiêu, tôi muốn bot **báo lỗi** khi tôi lỡ gõ hai token nguồn trong
   một tin, để không có khoản nào nằm sai tháng mà không ai biết.
10. Là người ghi chi tiêu, tôi muốn bot từ chối `spl`/`zlp` với `/income`, `/invest`,
    `/saving`, vì thu nhập và tiết kiệm không đến từ nguồn trả sau.
11. Là người ghi chi tiêu, tôi muốn bot chỉ nhận đúng ba chữ đó và **không** nhận "thẻ"
    hay "ví", để câu như `/other nạp thẻ 100k` vẫn là câu bình thường.
12. Là người mở file Excel, tôi muốn thấy `[spl] mua áo` ở ô mô tả, để biết khoản đó trả
    bằng nguồn nào mà không phải suy luận.
13. Là người mở file Excel, tôi muốn dòng không tiền tố nghĩa là tiền rời tài khoản ngay,
    để đọc file không cần chú thích.
14. Là người mở file Excel, tôi muốn cột `Ngày` vẫn giữ ngày tiêu thật, để đối chiếu được
    với sao kê của ví.
15. Là người dùng bot, tôi muốn tin xác nhận hiện emoji của nguồn, để liếc một cái là
    biết mình vừa gõ đúng token chưa.
16. Là người dùng bot, tôi muốn tin xác nhận nói rõ tháng trả khi khoản nhảy tháng, để
    không phải tự tính.
17. Là người dùng bot, tôi muốn `/help` liệt kê cả ba token kèm ngày chốt, vì đó là chỗ
    duy nhất tra ngược được token nào ứng với ví nào.
18. Là chủ file Excel, tôi muốn sửa ngày chốt của từng nguồn ngay trong sheet `Note`, để
    đổi mốc không cần deploy lại.
19. Là chủ file Excel, tôi muốn khối cấu hình có **nhãn** cạnh con số, để sáu tháng sau
    mở ra vẫn biết con số nào của ví nào.
20. Là chủ file Excel, tôi muốn bot vẫn ghi được khi sheet `Note` hỏng hoặc thiếu, để một
    ô gõ nhầm không làm chết cả bot.
21. Là chủ file Excel, tôi muốn giá trị ngày chốt vô lý bị bỏ qua, để không tạo ra tháng
    đích không tồn tại.
22. Là người dùng bot, tôi muốn `/undo` xoá đúng dòng vừa ghi kể cả khi dòng đó có tiền
    tố, để không xoá nhầm dòng khác.
23. Là người dùng bot, tôi muốn khoản đang nằm trong hàng đợi ghi lại lúc deploy vẫn ghi
    ra đúng nguồn, để không mất khoản và không mất nguồn.
24. Là người dùng bot, tôi muốn khoản mơ hồ đang chờ tôi bấm nút lúc deploy vẫn giữ nguồn
    đã gõ, để không phải nhập lại.
25. Là người dùng bot, tôi muốn khoản trả sau tiêu sau mốc chốt trong tháng 12 bị từ chối
    kèm in lại đủ thông tin, để chép tay sang file năm mới — như `cc` hiện nay.
26. Là người dùng bot, tôi muốn `/today` vẫn gom đủ khoản của hôm nay kể cả khi nó đã nằm
    ở sheet tháng sau, để con số không thiếu.
27. Là người bảo trì, tôi muốn nguồn là một tập đóng khai báo trong code, để thêm ví mới
    là một thay đổi có review chứ không phải một dòng gõ vào Excel.

## Implementation Decisions

### Mô hình nguồn

- `isCard: boolean` bị gỡ bỏ hoàn toàn. Thay bằng một trường **nullable**:
  `source: DeferredSource | null` với `DeferredSource = 'cc' | 'spl' | 'zlp'`.
- `null` = tiền rời tài khoản ngay (thực tế là thẻ debit). Nó **không** phải thành viên
  thứ tư của kiểu: nó không dịch tháng, không tiền tố, không emoji — làm nó thành thành
  viên nghĩa là mọi nơi dùng đều phải viết một nhánh ngoại lệ cho đúng một giá trị.
- Tập nguồn là **đóng, khai báo trong code**, đặt cạnh bảng phân loại lệnh và theo đúng
  hình dạng đó: mỗi nguồn mang nhãn hiển thị, emoji, và ngày chốt mặc định.
- Ngày chốt mặc định: `cc` = 7, `spl` = 24, `zlp` = 28.
- Emoji: `cc` = 💳, `spl` = 🛍️, `zlp` = 🔵. Emoji Unicode thuần — **không** dùng
  `custom_emoji` của Telegram (đòi Telegram Premium hoặc username mua trên Fragment;
  chủ bot không có).

### Tính tháng đích

- Hàm tính tháng đích đổi tham số: thay `isCard: boolean` bằng ngày chốt của nguồn, dạng
  nullable. `null` → tháng phát sinh, không tính gì thêm.
- **Công thức không đổi**: `ngày <= ngày chốt` → tháng phát sinh, ngược lại → tháng sau.
  Ba nguồn dùng chung đúng một công thức. Đây là tổng quát hoá, không phải thêm nhánh.
- Ranh giới giữ nguyên: tiêu **đúng ngày chốt** vẫn thuộc tháng phát sinh.
- Từ chối khoản tháng 12 vượt mốc giữ nguyên nguyên trạng, áp cho cả ba nguồn.

### Cấu hình ngày chốt

- Đọc từ sheet `Note`, **khối hai cột `H` (token nguồn) và `I` (ngày chốt)**, quét theo
  cột đúng cách bảng mã viết tắt `E`–`F` đang làm — nhờ vậy đọc được ở bất kỳ dòng nào.
- Ô `Note!B1` **nghỉ hưu**. Người dùng **đã tự dời** con số sang khối mới; không viết
  code đọc song song hai chỗ.
- Token không thuộc tập đóng → bỏ qua. Token thiếu, giá trị không phải số nguyên, hoặc
  ngoài khoảng 1–28 → dùng mặc định trong code cho nguồn đó. Giữ nguyên tinh thần hiện
  tại: sheet `Note` hỏng thì bot vẫn ghi được.
- Bản ghi cấu hình đọc từ `Note` mang ngày chốt của **cả ba nguồn**, không phải một số
  duy nhất.

### Cú pháp tin nhắn

- Ba token bị bóc khỏi câu **trước** khi quét số tiền, ngày và mô tả — đúng thứ tự `cc`
  đang làm.
- **Hai token nguồn trong một tin → lỗi**, không lấy token cuối. Đoán sai ở đây tạo ra
  khoản nằm sai tháng mà không có dấu hiệu nào báo.
- Ba token cấm dùng với `/income`, `/invest`, `/saving` — cùng tập cho phép mà `cc` đang
  dùng.
- Không nhận biến thể tiếng Việt (`thẻ`, `ví`, `td`). Lý do như cũ: `/other nạp thẻ 100k`
  là câu hoàn toàn bình thường.

### Ghi vào file

- Bảng vẫn **ba cột**. Nguồn được ghi bằng **tiền tố trong ô mô tả**: `[cc] `, `[spl] `,
  `[zlp] `; `null` → không tiền tố. Xem `docs/adr/0001-tien-to-nguon-trong-cot-mo-ta.md`.
- **Tách một hàm thuần dựng ba ô của dòng**: từ khoản đã chốt số tiền → `[mô tả có tiền
  tố, serial ngày, số tiền]`. Đây là **chỗ duy nhất** ghép tiền tố trong toàn hệ thống.
  Hàm ghi thật gọi nó. Nhờ vậy không đường phát lại nào (hàng đợi ghi lại, khoản mơ hồ)
  có thể ghép hai lần, và bản lưu để `/undo` đối chiếu là **cùng một mảng** với bản ghi
  vào Excel.
- Bản ghi vào nhật ký D1 dùng mô tả **đã có** tiền tố, để nhật ký khớp thứ nằm trong file.
- Mô tả người dùng gõ **không bao giờ** mang tiền tố — nó chỉ xuất hiện lúc dựng dòng.
  Nên tin xác nhận và câu hỏi số tiền mơ hồ vẫn hiện đúng chữ người dùng gõ.
- **Không backfill** dòng cũ. Thông tin "dòng này từng là khoản thẻ" không tồn tại ở file
  lẫn nhật ký D1 — tiền tố là quy ước từ thời điểm này trở đi.

### Hiển thị

- Dòng nguồn trong tin xác nhận: **chỉ emoji, không chữ**. Hai hình dạng giữ nguyên như
  hiện nay — không nhảy tháng thì nói tháng trả; nhảy tháng thì nói cả ngày tiêu và
  tháng trả.
- `/help`: mục "Thẻ tín dụng" đổi thành **"Nguồn trả sau"**, liệt kê ba dòng token + ngày
  chốt, kèm một câu giải thích chung. Ngày chốt lấy từ cấu hình đang chạy, không viết
  cứng trong chuỗi.

### Tương thích khi deploy

- Hai miếng vá `isCard` hiện có (chỗ giải quyết khoản mơ hồ và chỗ rút hàng đợi ghi lại)
  đang vá cho bản ghi **tạo ra trước khi có tính năng thẻ** — loại đó đã tuyệt chủng.
  **Vứt chúng đi**, thay bằng miếng vá mới đọc bản ghi kiểu cũ: có `source` thì dùng,
  không thì suy từ `isCard` (`true` → `'cc'`, còn lại → `null`).
- Mỗi miếng vá kèm comment **ghi rõ khi nào xoá được**: sau khi deploy xong và hàng đợi
  ghi lại đã rỗng.

### Tài liệu đi kèm commit

- `README.md`: đổi tiêu đề mục "Quẹt thẻ tín dụng" → "Nguồn trả sau"; bảng ba token +
  ngày chốt; thay mọi nhắc tới `Note!B1` bằng khối `H`–`I`; **xoá câu "mọi dòng mang ngày
  của tháng trước chính là dòng thẻ"** — câu đó sai hẳn khi có ba nguồn.
- Ba script còn nhắc `Note!B1` — script kiểm tra sheet `Note`, script đặt mốc chốt, và
  script nghiệm thu tính năng thẻ — phải cập nhật theo khối `H`–`I`.
- `CONTEXT.md` và ADR-0001 **đã viết xong**, không cần đụng lại.

## Testing Decisions

Test tốt ở repo này = **hàm thuần, không dựng `Env`, không giả lập Graph hay Telegram**.
Đó là lựa chọn có sẵn của codebase và spec này giữ nguyên. Test kiểm **hành vi quan sát
được** — dòng rơi vào bảng nào, ô mô tả ra chữ gì, tin nhắn chứa gì — không kiểm cấu trúc
nội bộ.

### Seam cao nhất, được nâng: "từ tin nhắn tới dòng Excel"

Test tích hợp hiện có nối phân tích tin nhắn → tính tháng đích → tên bảng, và hỏi "gõ chữ
này thì dòng rơi vào bảng nào". **Nâng nó lên trả về cả tên bảng lẫn ô mô tả sẽ ghi**,
nhờ hàm dựng dòng vừa tách ra. Một câu test khi đó trả lời trọn lời hứa của tính năng.

Phủ: mỗi nguồn với ngày chốt riêng rơi đúng bảng; đúng-ngày-mốc; ghi lùi ngày; tiền tố
đúng cho từng nguồn; không token thì không tiền tố; token đứng ở các vị trí khác nhau
trong câu vẫn cho cùng kết quả.

### Seam sẵn có, mở rộng tại chỗ

- **Phân tích tin nhắn**: bóc từng token; hai token nguồn → lỗi; cấm với `/income`,
  `/invest`, `/saving`; `thẻ`/`ví` **không** phải token; mô tả không dính token. Prior
  art: nhóm test "đánh dấu quẹt thẻ" và "cc chỉ dùng cho nhóm chi tiêu".
- **Tính tháng đích**: ngày chốt riêng từng nguồn; ranh giới đúng-ngày-mốc; `null` → luôn
  tháng phát sinh; tháng 12 vượt mốc → từ chối. Prior art: bộ test hiện có, dịch thẳng từ
  `isCard` sang ngày chốt nullable.
- **Đọc sheet `Note`**: đọc đủ ba ngày chốt từ khối `H`–`I`; token lạ bị bỏ qua; giá trị
  ngoài 1–28, không nguyên, rỗng → mặc định của nguồn đó; nguồn thiếu hẳn → mặc định.
  **Bắt buộc có ca `address` lệch** (kiểu `Note!E4:K12`) — lỗi bù trừ cột từng làm bảng mã
  viết tắt chết lặng trên production, và khối `H`–`I` phơi ra đúng rủi ro ấy. Prior art:
  ca test đã đánh dấu "HỒI QUY" trong bộ test sheet `Note`.
- **Định dạng tin nhắn**: emoji đúng cho từng nguồn; không nguồn thì không có dòng emoji;
  hình dạng nhảy tháng và không nhảy tháng; `/help` in đủ ba token kèm ngày chốt lấy từ
  cấu hình truyền vào. `/help` **hiện chưa có test nào** — thêm mới tại đây. Prior art:
  nhóm test "confirmation với khoản thẻ".

### Không test

Hàm ghi thật vẫn cần `Env` + Graph nên không có seam — đó chính là lý do phần dựng dòng
được tách ra khỏi nó. Không thêm mock `Env`, không thêm script nghiệm thu chạy thật: chạy
script làm chết chuỗi refresh token, phải `/reauth` lại, và thứ duy nhất nó kiểm thêm được
là "Graph có nuốt chuỗi `[spl] cơm` không" — trong khi mô tả tiếng Việt có dấu vẫn ghi
thành công hàng ngày.

## Out of Scope

- **Trả góp.** SPayLater trả góp 3/6/12 tháng biến một khoản thành nhiều dòng ở nhiều
  sheet, phá giả định "một khoản = một dòng" mà cả `/undo` lẫn nhật ký đang dựa vào.
  Ticket riêng.
- **Kỳ trả rơi sang tháng sau nữa.** Hiện cả ba nguồn đều trả trong tháng mà kỳ sao kê
  đóng. Nếu sau này cần, đó là thêm một trường vào bản ghi cấu hình của từng nguồn, một
  số hạng trong công thức, và một hình dạng dòng emoji — không bị thiết kế này chặn.
- **Cột thứ tư cho nguồn.** Xem ADR-0001. Kéo theo: không lọc, không PivotTable, không
  tính tổng theo nguồn.
- **Backfill dòng cũ.** Không khả thi, không phải không muốn.
- **Custom emoji Telegram.** Cần Telegram Premium hoặc username mua trên Fragment.
- **Danh sách nguồn đọc từ Excel.** Tập đóng trong code là quyết định, không phải thiếu
  sót.
- **Sửa chỗ `/today` cắt mô tả ở 22 ký tự.** Tiền tố ăn mất 6 ký tự hiển thị. Đã biết,
  chấp nhận.

## Further Notes

- Người dùng **đã tự sửa file Excel**: mốc chốt đã dời sang khối `H`–`I` của sheet `Note`.
  Cột `H`–`I` được xác nhận trống trước khi dùng.
- Sheet `Note` được xác nhận **không** có mã viết tắt nào tên `SPL` hoặc `ZLP`. Nếu sau
  này thêm mã trùng token nguồn thì mã đó sẽ chết lặng — token bị bóc trước khi bảng mã
  viết tắt chạy.
- Toàn bộ thiết kế này đã qua một vòng grilling đầy đủ; các quyết định trên là kết quả đã
  chốt, không phải đề xuất.
- Từ vựng dùng trong spec này theo `CONTEXT.md`: **khoản**, **nguồn trả sau**, **tháng
  phát sinh**, **tháng đích**, **ngày chốt sao kê**, **tiền tố nguồn**, **hàng đợi ghi
  lại**, **số tiền mơ hồ**.
