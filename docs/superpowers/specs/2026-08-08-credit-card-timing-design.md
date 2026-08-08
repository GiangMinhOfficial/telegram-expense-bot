# Thiết kế: Ghi chi tiêu thẻ tín dụng theo tháng thanh toán

Ngày: 08/08/2026
Trạng thái: đã duyệt thiết kế, chờ viết kế hoạch triển khai
Nối tiếp: [2026-08-08-telegram-expense-bot-design.md](2026-08-08-telegram-expense-bot-design.md)

---

## 1. Vấn đề

Khoản quẹt thẻ tín dụng phát sinh ở tháng này nhưng tiền rời tài khoản ở tháng khác, tuỳ kỳ sao kê.
Thẻ hiện dùng sao kê ngày 7 hàng tháng. Giao dịch ngày 3/8 nằm trong sao kê 7/8 nên trả trong tháng 8;
giao dịch ngày 10/8 rơi sang sao kê 7/9 nên trả trong tháng 9.

Bot hiện tại luôn ghi vào tháng của ngày phát sinh, nên mọi khoản quẹt thẻ sau ngày 7 đều bị đặt sớm
một tháng.

## 2. Vì sao đây là chuyện đúng/sai chứ không phải sở thích

Sheet `Tóm tắt` không chỉ tổng hợp. Nó là một **dòng tiền chạy liên tục từ tháng 1**:

```
Tóm tắt!I26  = I6 + I8 - I20 - I22     ← cuối kì = đầu kì + thu nhập − tổng chi − đầu tư
Tóm tắt!J6   = I26                     ← đầu kì tháng 9 = cuối kì tháng 8
```

Cả hai là shared formula trải suốt 12 cột (`ref="C26:L26" si="5"` và `ref="D6:M6" si="0"`), không đứt
đoạn. Dòng 26 vì thế trả lời câu **"tôi còn bao nhiêu tiền"**, không phải "tôi đã tiêu bao nhiêu".

Hệ quả: ghi khoản thẻ vào tháng phát sinh sẽ trừ tiền khỏi bảng trong khi tiền còn nguyên trong ngân
hàng. Sai lệch bằng đúng dư nợ thẻ chưa tới hạn, cuốn chiếu hàng tháng, không bao giờ tự đóng.

**Quyết định: dòng đi theo tháng thanh toán.**

Đánh đổi đã chấp nhận: tổng nhóm theo tháng bị lệch pha. Tổng "Ăn uống sinh hoạt" tháng 9 sẽ chứa cả
đồ ăn của tháng 8. Với một bảng ngân sách tiền mặt thì đây là đánh đổi đúng.

## 3. Kết quả tra cứu về kỳ sao kê

Nguồn: [Hỏi–Đáp thẻ tín dụng HSBC Việt Nam][faq] và [trang thông báo chính thức][notice].

[faq]: https://www.hsbc.com.vn/content/dam/hsbc/hbvn/documents/vi/ways-to-bank/card_faq_vn.pdf
[notice]: https://www.hsbc.com.vn/en-vn/important-information/

### 3.1 Ngày sao kê không phải thuộc tính của dòng thẻ

[Điều khoản LIVE+][tc] không quy định ngày sao kê — chỉ có quy định hoàn tiền. Ngày sao kê gắn với
**tài khoản thẻ**, không gắn với sản phẩm. Nguồn đáng tin duy nhất là bảng sao kê hoặc app HSBC.

[tc]: https://www.hsbc.com.vn/content/dam/hsbc/hbvn/documents/vi/important-information/terms-and-conditions-of-hsbc-live-credit-card-vn.pdf

### 3.2 Ranh giới: ngày mùng 7 thuộc kỳ sao kê tháng đó

Ba ví dụ trong bản Hỏi–Đáp, hai trong đó dùng đúng ngày sao kê mùng 7:

| Ngày giao dịch | Rơi vào sao kê | Ghi chú |
|---|---|---|
| 28/4 | 7/5 | Ví dụ tính lãi |
| 8/5 | 7/6 | Ví dụ 55 ngày miễn lãi |
| 10/5 | 7/6 | Ví dụ tính lãi |
| 15/7 | 14/8 | Thẻ sao kê ngày 14 |

Quy luật chung: **ngày kế sau ngày sao kê mở kỳ mới**. Suy ra kỳ sao kê 7/5 đóng vào hết ngày 7/5.

HSBC không viết thẳng "ngày mùng 7 tính vào kỳ này" — đây là suy luận từ ba ví dụ nhất quán của họ.

### 3.3 Hai điều làm quy tắc lung lay

**Mốc chốt đã từng bị dời.** Thông báo ngày 24/01/2024: khách có ngày sao kê **mùng 7 chuyển sang
mùng 4** từ kỳ tháng 2/2024. Đây là lý do trực tiếp khiến mốc chốt không được viết cứng trong mã.

**Mốc chốt xê dịch quanh cuối tuần.** Cùng thông báo: *"Statement date may change if it falls on
Friday, Saturday, Sunday or public holidays."* Mùng 7 rơi vào các ngày đó khoảng 5 tháng mỗi năm.

### 3.4 Hạn thanh toán không phải thứ quyết định

Bản Hỏi–Đáp cho thấy thẻ sao kê mùng 7 có hai kiểu hạn: **22/5** (cùng tháng, 15 ngày) và **2/6**
(tháng sau, 26 ngày — loại 55 ngày miễn lãi). Bảng tính đo lúc tiền rời tài khoản, nên cái quyết định
là ngày **thực trả**, không phải hạn. Người dùng xác nhận luôn trả trong tháng ra sao kê.

## 4. Quy tắc tháng đích

```
d = ngày phát sinh   m = tháng phát sinh   N = mốc chốt (đọc từ Note, mặc định 7)

tiền mặt        → tháng m
thẻ, d ≤ N      → tháng m
thẻ, d > N      → tháng m + 1
```

Bảng đích: `<nhóm>_<tháng đích>`. Cột `Ngày` **luôn ghi ngày phát sinh**, không đổi.

Ghi lùi ngày không cần luật riêng: `/food ăn trưa 40k 10/7 cc` gõ ngày 20/8 cho ra ngày 10/7 > 7, tức
kỳ sao kê 7/8, tức tháng 8 — đúng.

### 4.1 Phần thưởng ngoài dự tính: khoản thẻ tự phân biệt được

Tiền mặt luôn rơi đúng tháng của nó. Nên **mọi dòng trong sheet tháng 9 mang ngày thuộc tháng 8 chính
xác là dòng thẻ**. Muốn biết tháng 9 có bao nhiêu là nợ thẻ kỳ trước, một công thức trong Excel là ra,
không cần bot đánh dấu gì thêm. Đây là lý do cột `Ngày` giữ ngày phát sinh có giá trị hơn vẻ ngoài.

## 5. Cú pháp

```
/food ăn trưa 40k cc
```

`cc` đứng riêng thành một từ, ở bất kỳ vị trí nào trong câu — cùng cách bot đang nhận ngày.

**Chỉ nhận `cc`. Không nhận `thẻ`, `the`, `td`.** Lý do cụ thể: `/other nạp thẻ 100k` là câu hoàn toàn
bình thường để ghi nạp thẻ điện thoại. Nếu `thẻ` là từ khoá thì khoản đó bị đẩy sang tháng sau mà
không có dấu hiệu nào báo.

Hệ quả: `cc` là từ dành riêng, không dùng được làm mã viết tắt cửa hàng.

`cc` chỉ hợp lệ với 6 nhóm chi tiêu (`food`, `eat_out`, `transport`, `force`, `other`,
`other_expense`). Với `/income`, `/invest`, `/saving` thì từ chối — đó không phải khoản quẹt thẻ, và
`Tổng chi` của sheet cũng chỉ gồm 6 nhóm kia.

## 6. Mốc chốt nằm trong file

```
Note!A1   Ngày chốt sao kê thẻ
Note!B1   7
```

Bot đọc `B1` cùng lệnh gọi với bảng mã viết tắt — không tốn thêm lệnh gọi Graph, cache 10 phút như
hiện tại. Đổi 7 thành 4 là sửa một ô trong Excel: không sửa mã, không deploy lại.

Ô trống, không phải số, hoặc ngoài khoảng 1–28 thì quay về 7.

Chọn khoảng 1–28 vì mốc 29–31 không tồn tại ở mọi tháng.

## 7. Sửa lỗi đang có: sheet Note đọc sai cột

### 7.1 Lỗi

`loadShortcodes` giả định mảng `usedRange` trả về bắt đầu từ cột A, nên đọc `row[4]` cho mã và
`row[5]` cho tên. Nhưng `Note` trống cột A–D, nên `usedRange` bắt đầu ở **E4**:

```
address : Note!E4:K12
dòng 0  : [0]="WM" [1]="Winmart" [2]="" [3]="" [4]="" [5]="/food" [6]="Ăn uống sinh hoạt"
loadShortcodes() trả về: {}
```

`row[4]` trỏ vào cột I (trống), `row[5]` trỏ vào cột J (danh sách lệnh). **Bung mã viết tắt chưa bao
giờ chạy trên production.** Gõ `/other TC 40k` ghi vào file đúng chữ "TC".

Test đơn vị không bắt được vì chúng truyền thẳng bảng mã vào `parseMessage`; không có test nào chạy
`loadShortcodes` với dữ liệu có hình dạng thật.

Kiểm chứng bằng `scripts/check-note.mjs` (chỉ đọc).

### 7.2 Sửa

Sheet `Note` đọc bằng **vùng cố định `A1:Z50`** thay vì `usedRange`. Chỉ số cột khi đó ổn định bất kể ô
nào có dữ liệu, nên thêm `A1`/`B1` ở mục 6 không làm lệch bảng mã viết tắt.

Sheet tháng vẫn dùng `usedRange` vì chúng dài ra liên tục — `Tháng 8` mới đi được 8 ngày đã là
`A1:P44`, còn `Tháng 5`, `6`, `7` khi hết tháng nằm ở `A1:P83`, `A1:Z85`, `A1:P88`.

Nhưng `computeTotals` mắc đúng giả định đó (`row[0]` = cột A). Hiện nó đúng vì `Tháng N!A1` luôn có
công thức nên `usedRange` bắt đầu từ A1, nhưng đó là may chứ không phải bảo đảm. Sửa: lấy toạ độ cột
bắt đầu từ trường `address` mà Graph đã trả về sẵn rồi bù trừ chỉ số.

## 8. Dòng phản hồi

Khoản tiền mặt giữ nguyên format hiện tại, không thêm dòng nào.

Khoản thẻ không nhảy tháng:

```
✅ cơm trưa · 40.000đ · 03/08 → Ăn uống sinh hoạt
💳 trả tháng 8

Ăn uống sinh hoạt (T8)     215.000đ
Hôm nay                     77.000đ
Tổng chi T8              2.503.667đ
```

Khoản thẻ nhảy tháng — dòng thứ hai nói thẳng chuyện nhảy:

```
✅ cơm trưa · 40.000đ · 10/08 → Ăn uống sinh hoạt
💳 tiêu 10/08 → trả tháng 9

Ăn uống sinh hoạt (T9)      40.000đ
Ngày 10/08                 117.000đ
Tổng chi T9                 40.000đ
```

Con số 117.000đ ở đây là 77.000đ tiền mặt tiêu ngày 10/08 (nằm ở `Tháng 8`) cộng 40.000đ vừa quẹt
(nằm ở `Tháng 9`) — xem mục 8.1.

`Tổng chi T9` là hoá đơn tháng sau đang lớn dần — số đáng nhìn nhất sau khi quẹt thẻ.

**Dòng nhóm và dòng tổng chi đều lấy theo tháng đích, không phải tháng phát sinh.** Mã hiện tại dùng
`e.date.m` cho cả hai; phải đổi sang tháng đích, nếu không con số hiện ra sẽ không chứa khoản vừa ghi
— đúng loại lỗi đã gặp một lần với dòng giữa khi làm tính năng ghi lùi ngày.

Dòng phản hồi luôn nói rõ tháng đích. Đây là **lưới an toàn chính** cho cả ba giả định ở mục 12.

### 8.1 Dòng giữa cần đọc hai sheet

**Chỉ khi khoản thẻ nhảy tháng.** Lúc đó tổng chi của ngày đó nằm rải hai nơi: tiền mặt ngày 10/08 ở
`Tháng 8`, khoản thẻ vừa ghi ở `Tháng 9`. Cộng cả hai mới ra con số đúng.

Khoản tiền mặt, và khoản thẻ không nhảy tháng, vẫn chỉ đọc một sheet như hiện nay.

Thêm một lệnh gọi Graph nhưng **không chậm thêm**: hiện ba bước chạy nối tiếp (thêm dòng → vá định
dạng → đọc tổng). Đổi thành `thêm dòng → song song(vá định dạng, đọc T8, đọc T9)` thì tổng thời gian
xấp xỉ như cũ, và khoản tiền mặt cũng nhanh lên.

### 8.2 Ảnh hưởng tới các lệnh khác

| Lệnh | Thay đổi |
|---|---|
| `/today` | Cộng hai sheet như mục 8.1 |
| `/thang` | Không sửa mã. Nghĩa đã đổi: giờ là "tiền rời tài khoản trong tháng" |
| `/undo` | Không sửa mã. D1 vốn lưu tên bảng đích nên nó xoá đúng `food_9` |
| `/help` | Thêm mô tả `cc` và mốc chốt hiện hành |

## 9. Các ca biên

| Tình huống | Xử lý |
|---|---|
| `cc` + ghi lùi ngày qua ranh giới | Áp đúng công thức mục 4, không cần luật riêng |
| `cc` với `/income`, `/invest`, `/saving` | Từ chối kèm lý do |
| `cc` + số tiền mơ hồ (1000–9999) | Cờ thẻ và tháng đích đi kèm bản ghi chờ trong D1; nút bấm giữ cơ chế cũ |
| `cc` gõ hai lần | Coi như một |
| Ô `Note!B1` hỏng | Quay về 7 |
| Tháng 12, thẻ, ngày > N | **Từ chối** (mục 10) |

## 10. Khoản thẻ tháng 12

Giao dịch thẻ ngày 10/12/2026 trả vào tháng 1/2027. File này là file 2026, không có sheet chứa nó.

**Bot từ chối, in lại khoản đã hiểu để chép tay sang file 2027.** Nhất quán với chính sách v1 hiện có
là từ chối ngày ngoài năm 2026.

```
⚠️ Khoản này rơi vào kỳ trả tháng 1/2027 — file 2026 chưa có chỗ.
   cơm trưa · 40.000đ · 10/12 · Ăn uống sinh hoạt
   Chép tay vào file sang năm nhé.
```

Ảnh hưởng: khoản thẻ từ ngày N+1 đến 31/12, khoảng ba tuần mỗi năm. Xem lại vào tháng 12/2026 khi có
file 2027.

## 11. Kiểm thử

### 11.1 Test hồi quy cho lỗi mục 7 — quan trọng nhất

Đưa vào `loadShortcodes` một mảng có dữ liệu bắt đầu ở cột E (cột A–D trống, đúng hình dạng thật của
sheet `Note`), đòi nó trả về `{WM: "Winmart", TC: "TocoToco", MT: "Mầm Trà", VM: "V-mart"}`.

Test này mà có từ đầu thì lỗi kia đã không lên production.

### 11.2 Test đơn vị

| Hàm | Ca cần phủ |
|---|---|
| `paymentMonth` | tiền mặt mọi ngày → m · thẻ ngày 1..N → m · thẻ ngày N+1..31 → m+1 · **thẻ đúng ngày N → m** · tháng 12 + thẻ + ngày > N → lỗi · **mốc = 4, thẻ ngày 5 → m+1** (chứng minh giá trị trong Note thật sự được dùng) |
| `parseMessage` | `cc` ở đầu/giữa/cuối · **`/food nạp thẻ 100k` KHÔNG phải khoản thẻ** · `/food cc 40k` → thiếu mô tả · `/income lương 20tr cc` → từ chối |
| `readCutoff` | hợp lệ · ô trống · không phải số · ngoài 1–28 |
| `computeTotals` | địa chỉ vùng **không** bắt đầu từ A1 vẫn tính đúng (hồi quy cho mục 7.2) |
| `confirmation` | tiền mặt (không đổi) · thẻ cùng tháng · thẻ nhảy tháng · **nhãn nhóm và nhãn tổng chi mang tháng đích, không mang tháng phát sinh** |

### 11.3 Kịch bản trên file gốc

1. Ghi một khoản thẻ ngày sau mốc chốt
2. Xác nhận dòng nằm ở `food_<m+1>`, **không** ở `food_<m>`
3. Xác nhận cột tháng m+1 của `Tóm tắt` nhích đúng số tiền đó
4. Xác nhận cột tháng m của `Tóm tắt` **đứng yên**
5. `/undo` rồi xác nhận cả hai cột trở về nguyên trạng
6. Gửi `/other TC 40k`, xác nhận mô tả ghi vào file là "TocoToco" — hồi quy mục 7 trên dữ liệu thật

## 12. Giả định phải chấp nhận

| # | Giả định | Nếu sai |
|---|---|---|
| 1 | Mốc chốt của thẻ là 7, không phải 4 | Khoản ngày 5–7 lệch một tháng. HSBC đã dời mốc này một lần (mục 3.3) |
| 2 | Ngày sao kê không xê dịch | Xê dịch 1–2 ngày khoảng 5 tháng mỗi năm theo thông báo của HSBC |
| 3 | Ngày ghi nhận là ngày quẹt, không phải ngày ngân hàng hạch toán | Hạch toán trễ 1–3 ngày là thường; khoản quẹt ngày 6 có thể vào sổ ngày 8 |

Cả ba dẫn tới cùng một hậu quả — lệch tối đa một tháng, chỉ với khoản sát ranh giới — và cùng một lưới
an toàn: dòng phản hồi luôn nói rõ tháng đích, nên sai là thấy ngay lúc gõ.

Giả định 1 kiểm bằng cách mở bảng sao kê gần nhất. Không chặn triển khai: sửa là đổi một ô trong Excel.

## 13. Ngoài phạm vi

| Việc | Lý do |
|---|---|
| Cú pháp ép tháng đích, ví dụ `cc t9` | Để dành. Nếu thực tế đặt sai vài lần thì thêm — lúc đó đã biết nó hỏng theo kiểu nào |
| Ghi khoản thẻ tháng 12 sang file 2027 | Cần cơ chế nhiều file và hàng đợi sống hàng tháng. Xem lại tháng 12/2026 |
| Nhiều thẻ, mỗi thẻ một mốc chốt | Hiện chỉ có một thẻ |
| Ghi khoản thanh toán sao kê như một dòng riêng | Sẽ tính trùng, vì từng khoản đã được ghi rồi |
| Đánh dấu dòng thẻ trong file | Không cần — suy ra được từ tháng của cột `Ngày` (mục 4.1) |
