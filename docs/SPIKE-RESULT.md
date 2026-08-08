# Biên bản BƯỚC 0 — spike kiểm chứng `rows/add`

**Ngày chạy:** 2026-08-08
**Chạy trên:** `Theo dõi chi tiêu - TEST.xlsx` (bản sao trên OneDrive) — **không đụng file gốc**
**Kết luận:** ✅ **PASS 12/12 — `rows/add` an toàn, tiếp tục Task 6.**

---

## Câu hỏi cổng chặn

> Việc chèn dòng có làm hỏng công thức tổng hợp của `Tóm tắt` không?

**Không.** Đây là bằng chứng.

| # | Kiểm chứng | Kết quả |
|---|---|---|
| 1 | Graph ghi được vào bảng `food_8` | ✅ `index=6` |
| 1b | PATCH định dạng ô Ngày | ✅ `numberFormat = d-mmm` |
| 2 | `Tóm tắt!I10` tăng đúng số tiền | ✅ 175.000 → 187.345 (+12.345) |
| 2b | `Tóm tắt!I13` tăng đúng số tiền | ✅ 2.175.000 → 2.187.345 (+12.345) |
| 3 | Nhãn cột `M` không đổi | ✅ cả 8 nhãn nguyên vẹn |
| 4 | `SUBTOTAL` của bảng và `N2` tự tính lại | ✅ 175.000 → 187.345 |
| 4b | Công thức `Tóm tắt!I10` và `N2` không hỏng | ✅ `='Tháng 8'!N2` \| `=food_8[[#Totals],[số tiền]]` |
| 5 | Ô Ngày hiển thị thành ngày | ✅ giá trị `46242`, hiện `"8-Aug"` |
| 5b | Ô số tiền giữ định dạng tiền tệ | ✅ hiện `" VND 12,345 "` |
| 6 | Sau **6 lần chèn dồn**, `Tóm tắt` vẫn đúng | ✅ 175.000 → 192.345 (+17.345) |
| 6b | Sau 6 lần chèn, nhãn cột `M` vẫn nguyên | ✅ |
| 7 | `DELETE rows/itemAt` chạy được, `Tóm tắt` vẫn đúng | ✅ 192.345 → 180.000 |

### Quan sát then chốt

**Excel tự điều chỉnh tham chiếu ô khi dòng dịch xuống.** Công thức `Tháng 8!M4` đi
`=A11 → =A12 → =A17` qua các lần chèn — luôn trỏ đúng ô tiêu đề dù ô đó bị đẩy xuống.
Đây chính là điều spec mục 5.2 đặt dấu hỏi, và câu trả lời là **có, Excel làm đúng**.

**Toàn bộ con số trong `Tóm tắt` đi qua tham chiếu có cấu trúc** (`food_8[[#Totals],[số tiền]]`),
loại bám theo bảng nên miễn nhiễm với dịch chuyển hàng. Dự đoán ở spec 5.2 được xác nhận.

---

## Hai phát hiện trong lần chạy đầu

Lần chạy đầu ra 8/10. Cả hai mục fail đều đã truy nguyên xong.

### FAIL 4 — lỗi của chính script spike, không phải lỗi workbook

Script đọc tổng của bảng ở địa chỉ cứng `C9`. Nhưng dòng Tổng cộng **dịch xuống** mỗi lần
chèn — sau 6 dòng nó đã ở `C14`. Script đọc `C9` là đang đọc một ô dữ liệu, không phải ô tổng.

`SUBTOTAL` thực ra vẫn tính lại đúng suốt: `N2` (tham chiếu có cấu trúc) tăng chính xác +12.345
ngay từ đầu.

Trớ trêu là script mắc đúng cái lỗi mà spec mục 5.2 cảnh báo. **Đã sửa:** hỏi Graph vị trí
hiện tại của dòng tổng qua `tables/food_8/totalRowRange` thay vì ghi cứng địa chỉ.

### FAIL 5 — vấn đề thật, đã có cách sửa và đã kiểm chứng

`rows/add` **không kế thừa định dạng số của cột Ngày**. Đối chiếu trực tiếp:

```
row | mô tả       | ngày: text / format   | tiền: text / format
  4 | cơm trưa    | 5-Aug    d-mmm        |  VND 40,000   [$VND] #,##0
  8 | cơm trưa    | 3-Aug    d-mmm        |  VND 40,000   [$VND] #,##0
  9 | spike 0     | 46242    General  ✗   |  VND 1,000    [$VND] #,##0  ✓
 13 | spike 4     | 46242    General  ✗   |  VND 1,000    [$VND] #,##0  ✓
```

Cột **số tiền kế thừa được** định dạng, cột **Ngày thì không** → hiện số serial thô `46242`.

**Cách sửa:** sau `rows/add`, gọi thêm

```
PATCH /workbook/tables/{tên}/rows/itemAt(index={i})/range
{ "numberFormat": [[null, "d-mmm", null]] }
```

Đã kiểm chứng: trả `200`, ô ngày hiện `"8-Aug"`. Chi phí **đúng 1 lệnh gọi Graph**, không cần
tính địa chỉ ô. Dùng `null` cho hai cột kia để giữ nguyên định dạng sẵn có của chúng.

`d-mmm` là định dạng **các dòng sẵn có trong file đang dùng** — chọn nó để dòng mới trông
giống hệt dòng cũ. Đổi bằng một hằng số nếu muốn kiểu khác.

---

## Ảnh hưởng tới thiết kế

| Mục | Trước | Sau |
|---|---|---|
| Thao tác ghi | `rows/add` | `rows/add` **+ `PATCH numberFormat`** |
| Lệnh gọi Graph mỗi tin nhắn | ~2 | **~3** (thêm, vá định dạng, đọc tổng) |
| Giả định 1 của spec (`rows/add` an toàn) | chưa kiểm chứng | ✅ **đã xác nhận** |
| Giả định 2 (Excel điều chỉnh `M4 = A11`) | chưa kiểm chứng | ✅ **đã xác nhận** |
| Giả định 3 (`SUBTOTAL` tự tính lại) | chưa kiểm chứng | ✅ **đã xác nhận** |
| Giả định 4 (serial hiện thành ngày) | chưa kiểm chứng | ⚠️ **chỉ đúng khi vá định dạng** |
| Giả định 5 (`DELETE` an toàn) | chưa kiểm chứng | ✅ **đã xác nhận** |

Không có giả định nào đổ vỡ. Thiết kế giữ nguyên, chỉ thêm một lệnh gọi vào thao tác ghi.

---

## Phát hiện phụ: refresh token xoay vòng

Ngay lần gọi Graph đầu tiên, Microsoft đã trả về refresh token mới và vô hiệu cái cũ. Script
spike bản đầu vứt token mới đi nên **lần chạy thứ hai sẽ chết với `invalid_grant`**.

Đã sửa bằng `scripts/lib/dev-vars.mjs`: ghi đè token mới vào `.dev.vars` ngay khi nhận được.
Đây đúng là rủi ro spec mục 3.2 đã nêu — lần này gặp ở script chạy tay thay vì ở Worker.
