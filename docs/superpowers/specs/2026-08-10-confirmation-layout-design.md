# Gom tin nhắn xác nhận về một phạm vi

Ngày: 2026-08-10

## 1. Vấn đề

Sau mỗi lần ghi, bot trả về ba con số. Hiện tại chúng có **ba phạm vi khác nhau**:

```
✅ CCQ · 3.100.000đ · 10/08 → Đầu tư

Đầu tư (T8)  6.400.000đ      ← nhóm vừa ghi, cả tháng
Hôm nay         55.000đ      ← MỌI nhóm chi tiêu, trong ngày
Tổng chi T8  2.450.000đ      ← MỌI nhóm chi tiêu, cả tháng
```

Không có gì trong tin nhắn nói cho người đọc biết dòng nào đang nói về cái gì. Hệ quả cụ thể đã xảy ra: ghi `/invest CCQ 3tr1` xong, dòng `Hôm nay` hiện 55.000đ và người dùng hiểu là bot tính sót khoản 3,1 triệu vừa ghi. Con số đó không sai — đầu tư không phải chi tiêu nên đúng là không được cộng vào — nhưng cái nhãn không đủ để hiểu ra điều đó.

Đây là lỗi nhãn, không phải lỗi số. Sửa bằng cách thêm chữ vào nhãn chỉ chữa triệu chứng: ba phạm vi trộn lẫn vẫn còn đó, và mỗi lần đọc vẫn phải tự nhắc mình dòng nào đếm cái gì.

## 2. Nguyên tắc

**Cả ba dòng cùng nói về nhóm vừa ghi.**

Đọc từ trên xuống là ba mức phóng to dần: khoản này → ngày ghi nhận → tháng thanh toán. Không còn dòng nào nói về nhóm khác, nên không còn chỗ để hiểu nhầm.

Cái mất đi là cái nhìn toàn cục ngay trong tin nhắn xác nhận. Chấp nhận được: `/today` và `/thang` tồn tại đúng để làm việc đó, và chúng không đổi.

## 3. Bố cục

| Dòng | Nhãn | Giá trị |
|---|---|---|
| 1 | `<tên ngắn>` | số tiền của khoản vừa ghi |
| 2 | `Hôm nay` hoặc `Ngày dd/mm` | tổng **nhóm đó** trong ngày ghi nhận |
| 3 | `<tên ngắn> T<tháng>` | tổng **nhóm đó** trong tháng thanh toán |

Dòng tiêu đề `✅ …` giữ nguyên như hiện tại, kể cả dòng `💳` của khoản quẹt thẻ.

Dòng 1 lặp lại số tiền đã có ở dòng tiêu đề. Đây là lựa chọn có chủ ý: ba con số thẳng cột cho phép so sánh bằng mắt mà không phải nhảy giữa hai định dạng khác nhau.

## 4. Tên ngắn

Nhãn đầy đủ vẫn dùng ở dòng tiêu đề vì đó là tên thật của nhóm trong file. Trong khối ba dòng dùng tên ngắn để khối không tràn màn hình điện thoại.

| Lệnh | Nhãn đầy đủ | Tên ngắn |
|---|---|---|
| `/food` | Ăn uống sinh hoạt | Ăn uống |
| `/eat_out` | Ăn ngoài | Ăn ngoài |
| `/transport` | Phương tiện di chuyển | Di chuyển |
| `/force` | Chi tiêu bắt buộc | Bắt buộc |
| `/other` | Linh tinh | Linh tinh |
| `/other_expense` | Chi tiêu khác | Chi khác |
| `/income` | Thu nhập | Thu nhập |
| `/invest` | Đầu tư | Đầu tư |
| `/saving` | Tiết kiệm | Tiết kiệm |

Tên ngắn dài nhất là 9 ký tự; cộng ` T12` thành 13. Khối rộng khoảng 25 ký tự kể cả cột số căn phải.

## 5. Ví dụ

Số liệu lấy từ sheet `Tháng 8` thật tại thời điểm viết spec: ngày 10/08 có bánh mì que 15.000đ và cơm trưa 40.000đ; tổng Ăn uống tháng 8 là 250.000đ; CCQ 3.100.000đ ngày 10/08 và 3.300.000đ ngày 03/08.

**Khoản chi thường**

```
✅ cơm trưa · 40.000đ · 10/08 → Ăn uống sinh hoạt

Ăn uống        40.000đ
Hôm nay        55.000đ
Ăn uống T8    250.000đ
```

**Khoản đầu tiên của nhóm trong ngày** — dòng 1 và dòng 2 bằng nhau, đúng như mong đợi:

```
✅ bánh mì que · 15.000đ · 10/08 → Ăn uống sinh hoạt

Ăn uống        15.000đ
Hôm nay        15.000đ
Ăn uống T8    210.000đ
```

**Đầu tư** — lý do của cả spec này:

```
✅ CCQ · 3.100.000đ · 10/08 → Đầu tư

Đầu tư        3.100.000đ
Hôm nay       3.100.000đ
Đầu tư T8     6.400.000đ
```

Không còn dòng nào hiện 55.000đ hay 0đ để gây hiểu nhầm.

**Ghi lùi ngày** — dòng 2 đổi nhãn và tính tổng của ngày đó, không phải hôm nay:

```
✅ bánh mì trứng chả · 20.000đ · 09/08 → Ăn uống sinh hoạt

Ăn uống        20.000đ
Ngày 09/08     20.000đ
Ăn uống T8    250.000đ
```

**Quẹt thẻ nhảy tháng** — `/food ăn trưa 40k cc` ngày 10/08, dòng ghi vào `Tháng 9`:

```
✅ ăn trưa · 40.000đ · 10/08 → Ăn uống sinh hoạt
💳 tiêu 10/08 → trả tháng 9

Ăn uống        40.000đ
Hôm nay        95.000đ
Ăn uống T9     40.000đ
```

Dòng 3 theo **tháng thanh toán** (T9), khớp với nơi dòng thực sự nằm — đúng nguyên tắc đã chốt ở spec thẻ tín dụng ngày 2026-08-08.

Dòng 2 cộng cả hai sheet: 55.000đ tiền mặt nằm trong `Tháng 8` cộng 40.000đ thẻ vừa ghi nằm trong `Tháng 9`. Đọc một sheet thì tổng của ngày 10/08 bị hụt mất một nửa.

## 6. Nguồn số liệu

**Dòng 1** lấy thẳng từ khoản đã phân tích trong tin nhắn. Không đọc file.

**Dòng 3** giữ nguyên cách tính hiện có: tra bảng tổng hợp `M:N` theo nhãn đầy đủ, trượt thì đọc dòng `Tổng cộng` ở chân bảng của nhóm. Cả hai đều là ô công thức do Excel tự tính, nên luôn khớp với file.

**Dòng 2** là phần mới. Cần tổng của một nhóm trong một ngày, tức phải biết những dòng nào thuộc nhóm đó.

Mọi khối trong sheet tháng có cùng hình dạng: ô tiêu đề mang tên nhóm, ngay dưới là dòng `Mô tả chi tiêu`, rồi các khoản, rồi dòng `Tổng cộng`. Trong mỗi khối, cột tiêu đề là mô tả, lệch phải 1 là ngày, lệch phải 2 là số tiền. Khối bắt đầu ở cột A, E hoặc I.

Gom bước định vị khối thành một hàm dùng chung cho cả dòng 2 và dòng 3:

```ts
interface Block {
  /** Chỉ số cột tuyệt đối của cột mô tả */
  col: number;
  /** Các dòng khoản chi, không gồm tiêu đề và Tổng cộng */
  rows: unknown[][];
  /** Giá trị ở dòng Tổng cộng, null nếu khối không có dòng đó */
  footerTotal: number | null;
}

function findBlock(sheet: SheetData, categoryLabel: string, off: number): Block | null;
```

Quy tắc dừng: gặp dòng `Mô tả chi tiêu` lần thứ hai nghĩa là đã lọt sang khối kế tiếp trong cùng cột — dừng lại, trả về những dòng đã gom được và đặt `footerTotal` là `null`. Cột I chứa ba khối nối đuôi nhau (Thu nhập, Đầu tư, Tiết kiệm) nên không có chốt này thì một khối thiếu dòng `Tổng cộng` sẽ khiến bot lấy tổng của nhóm bên dưới. Thà không có số còn hơn báo tiền của nhóm khác.

Khi `findBlock` trả về `null`, dòng 2 bằng 0. Dòng 3 không phụ thuộc hoàn toàn vào nó: bảng tổng hợp `M:N` vẫn được tra trước, nên bảy nhóm có mặt ở đó vẫn ra số đúng; chỉ Đầu tư và Tiết kiệm mới rơi về 0. Bot vẫn trả lời, khoản chi vẫn đã ghi.

## 7. Thay đổi trong code

| File | Thay đổi |
|---|---|
| `src/config.ts` | mỗi nhóm thêm trường `short` |
| `src/graph/totals.ts` | `Totals` còn `{ categoryDay, categoryMonth }`; thêm `findBlock` và `sumCategoryDay`; `blockTotal` dùng lại `findBlock` |
| `src/telegram/format.ts` | `confirmation` nhận thêm `short`, dựng ba dòng mới |
| `src/handlers/write.ts` | truyền `short`, cộng dồn hai sheet bằng `sumCategoryDay` |

**Xoá vì thành mồ côi sau thay đổi này:** trường `monthSpend` trong `Totals`, hằng `TOTAL_LABEL`, và hàm `sumDay` cũ. Cả ba chỉ phục vụ hai dòng bị thay thế; không còn ai gọi.

`SPEND_BLOCKS` giữ lại — `handlers/query.ts` vẫn dùng.

## 8. Không đổi

- Những gì bot ghi vào file: dòng dữ liệu trước và sau thay đổi này giống hệt nhau
- Cách đọc tin nhắn, chọn nhóm, chọn tháng, quy tắc thẻ tín dụng
- Dòng tiêu đề `✅` và dòng `💳`
- `/today`, `/thang`, `/undo`, `/help`
- Tin nhắn từ chối khoản thẻ vắt sang năm sau

Luồng hỏi lại số tiền mập mờ và hàng đợi ghi lại đều kết thúc ở `performWrite`, nên tự động dùng bố cục mới.

## 9. Kiểm thử

`tests/totals.test.ts`

- khoản đầu tiên của nhóm trong ngày → `categoryDay` bằng đúng khoản đó
- khoản thứ hai → `categoryDay` cộng dồn
- khoản của nhóm khác cùng ngày KHÔNG lọt vào `categoryDay`
- ngày khác cho tổng khác — dùng cho ghi lùi ngày
- nhóm chưa có khoản nào trong tháng → cả hai bằng 0
- vùng đọc bắt đầu từ cột I vẫn định vị đúng khối
- khối nằm dưới một khối khác trong cùng cột không vớ nhầm dòng `Tổng cộng` phía trên

`tests/format.test.ts`

- ba dòng đúng nhãn và đúng thứ tự
- nhãn dòng 2 đổi thành `Ngày dd/mm` khi ghi lùi ngày
- nhãn dòng 3 theo tháng thanh toán, không phải tháng phát sinh
- khoản thẻ vẫn có dòng `💳`

Sau khi test xanh, đối chiếu lại trên snapshot thật của `Tháng 8` như đã làm với bản sửa `/invest`: dựng tin nhắn cho `/food`, `/invest`, `/saving`, `/income` rồi so từng con số với file.

## 10. Giả định

1. **Mọi khối trong sheet tháng có cùng hình dạng** — tiêu đề, `Mô tả chi tiêu`, các khoản, `Tổng cộng`; ngày lệch phải 1 cột, số tiền lệch phải 2. Đã kiểm trên cả 9 khối của `Tháng 8`. Nếu một tháng nào đó lệch chuẩn, dòng 2 và 3 về 0 chứ không báo số sai.
2. **Không có mô tả khoản chi nào trùng chuỗi `Tổng cộng` hoặc `Mô tả chi tiêu`.** Trùng thì khối bị cắt sớm và dòng 2 thiếu khoản. Rủi ro thấp, không xử lý riêng.
3. **Tên nhóm trong sheet không đổi.** Đã đúng với giả định sẵn có của `computeTotals`.

## 11. Phụ thuộc

Bản sửa `/invest`/`/saving` đọc tổng nhóm từ chân bảng (`blockTotal`) hiện đang nằm trong working tree, chưa commit. Dòng 3 của spec này dựa lên nó — không có nó thì `Đầu tư T8` vẫn ra 0đ. Commit bản sửa đó trước, hoặc gộp chung vào nhánh triển khai spec này.
