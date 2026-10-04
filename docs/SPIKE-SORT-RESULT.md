# Biên bản spike — sắp xếp bảng theo ngày

**Ngày chạy:** 2026-10-02
**Chạy trên:** `Theo dõi chi tiêu - TEST.xlsx` (bản sao tạo lại trong lần chạy này) — **không đụng file gốc**
**Script:** `scripts/spike-sort.mjs`, bảng `food_8`
**Kết luận:** ✅ **`sort/apply` dùng được.** 11/13 PASS; hai mục FAIL đều đã truy nguyên, một mục
đổi thiết kế (dòng trống không tự về đáy), một mục là đọc sớm chứ không phải lỗi dữ liệu.

---

## Ba câu hỏi cổng chặn

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Định dạng ngày có đi theo dòng khi sắp không? | ✅ Có. Mọi dòng giữ `d-mmm`, hiện `25-Jul`, `28-Jul`… không dòng nào về số serial thô |
| 2a | Ngày có tăng dần, cùng ngày có giữ thứ tự ghi không? | ✅ Có. Ba dòng cùng ngày ghi theo thứ tự 1, 2, 3 ra đúng 1, 2, 3; sắp lần hai cho kết quả y hệt |
| 2b | Dòng trống và dòng không ngày có dồn xuống đáy không? | ⚠️ **Một nửa.** Cả hai dồn xuống dưới mọi dòng có ngày, nhưng **giữ thứ tự cũ giữa chúng với nhau** |
| 3 | `Tóm tắt` và dòng Tổng cộng có còn đúng không? | ✅ Có. Tổng cộng, `Tháng 8!N2`, `Tóm tắt!I10` cùng tăng đúng +1.006; công thức và nhãn cột `M` nguyên vẹn |

Lệnh đã dùng:

```
POST /workbook/tables/{tên}/sort/apply
{ "fields": [{ "key": 1, "ascending": true }] }
```

`key` là chỉ số cột **trong bảng** (0-based) — cột Ngày là `1`.

---

## Hai mục FAIL

### FAIL 2 — dòng trống không tự về đáy (đổi thiết kế)

Sau khi sắp, ba dòng không có ngày nằm đúng theo thứ tự chúng có **trước** khi sắp:

```
44 |                        |          General  |
45 |                        |          d-mmm    |
46 | spike-sort khong ngay  |          General  |  VND 500
```

Với Excel, "trống cả dòng" và "chỉ trống ô ngày" là một: đều là ô ngày rỗng, đều bằng nhau khi
so, và sắp ổn định thì giữ thứ tự cũ. Nên **không thể nhờ riêng lệnh sắp** để có "đúng một dòng
trống ở đáy".

**Cách sửa:** sau khi sắp, bot đọc lại các dòng của bảng rồi tự chỉnh — xoá mọi dòng trống cả
ba ô không nằm ở đáy, thêm một dòng trống nếu đáy chưa có. Trường hợp thường gặp (bảng không có
dòng thiếu ngày) thì dòng trống sẵn có tự về đáy và bước này không phải ghi gì.

### FAIL 7 — đọc tổng ngay sau `DELETE` ra số cũ (không phải lỗi dữ liệu)

Ngay sau lệnh xoá cuối cùng, `totalRowRange` trả 1.328.100 trong khi các dòng đã về đúng 40 dòng
ban đầu. Đọc lại vài phút sau: Tổng cộng = tổng tự cộng các dòng = `Tóm tắt!I10` = **1.328.000**,
đúng số ban đầu. Con số lệch 100 chính là dòng vừa xoá — Graph trả giá trị tính trước lệnh xoá.

Hệ quả cho bot: **không tin số tổng đọc ngay sau một lệnh xoá**. Bot hiện không làm thế (nó đọc
tổng sau `rows/add`, kiểm chứng ở BƯỚC 0), và thiết kế mới đọc tổng trước khi dọn bảng.

---

## Phát hiện phụ

- **File thật đã có sẵn đúng một dòng trống ở đáy mỗi bảng** (`food_8`: 39 khoản + 1 dòng trống,
  định dạng ô ngày `General`). Bot hiện nối khoản mới xuống **dưới** dòng trống đó.
- **`rows/add` nhận `[null, null, null]`** — thêm được dòng trống qua Graph.
- **Xoá theo chỉ số sau khi sắp chạy đúng**: chỉ số là vị trí hiện tại của dòng, không phải vị trí
  lúc thêm. Đây là lý do `/undo` không thể dùng chỉ số đã lưu nữa.
- **Trạng thái sắp bám lại trên bảng** (`GET sort` trả `key: 1, ascending: true`). `sort/clear`
  gỡ nó đi mà không đổi thứ tự dòng. Excel không tự sắp lại khi có dòng mới.
- **Bản sao TEST cũ đã không còn trên OneDrive**; `make-test-copy.mjs` tạo lại, `TEST_ITEM_ID` mới
  đã ghi vào `.dev.vars`. Sau spike bảng `food_8` của bản TEST về đúng 40 dòng ban đầu.
- **Token trong `.dev.vars` trước đó là chuỗi cũ cần `client_secret`** (`AADSTS70002`) — phải
  `/reauth` rồi chép token mới thì script mới chạy.
