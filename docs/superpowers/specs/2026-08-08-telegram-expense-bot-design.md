# Thiết kế: Bot Telegram ghi chi tiêu vào Excel

**Ngày:** 2026-08-08
**Trạng thái:** Đã chốt thiết kế, chờ lập kế hoạch triển khai
**File đích:** `D:\Documents\Onedrive\Documents\TCCN\Theo dõi chi tiêu.xlsx` (OneDrive cá nhân)

---

## 1. Mục tiêu

Ghi chi tiêu từ điện thoại trong dưới 5 giây bằng một tin nhắn Telegram, ví dụ `/food ăn trưa 40k`,
và có xác nhận tức thì rằng dữ liệu đã nằm trong file Excel.

**Tiêu chí thành công**

- Gõ một dòng trên điện thoại → dòng chi tiêu xuất hiện đúng bảng, đúng tháng trong file Excel.
- Phản hồi xác nhận trong vòng ~1 giây, hiển thị số tiền đã được hiểu để bắt lỗi ngay.
- Hoạt động 24/7, không phụ thuộc máy tính cá nhân có bật hay không.
- Không làm sai lệch công thức tổng hợp sẵn có trong file.
- Chi phí vận hành 0đ.

---

## 2. Khảo sát file hiện tại

Kết quả đọc trực tiếp cấu trúc `.xlsx` (16 sheet, 209 KB):

| Phát hiện | Chi tiết |
|---|---|
| Cấu trúc sheet | `Note`, `Tháng 1`…`Tháng 12`, `Tóm tắt`, `Sheet1` (ẩn), `Power Automate Flow` (ẩn) |
| **108 bảng Excel** | Đặt tên nhất quán tuyệt đối theo `<category>_<tháng>`: `food_8`, `transport_7`… |
| **Schema đồng nhất** | Cả 108 bảng đều có đúng 3 cột `Mô tả chi tiêu \| Ngày \| số tiền` và `totalsRowCount=1` |
| Nội dung sheet sạch | Không chart, không pivot, không macro, không hình ảnh — chỉ bảng + style |
| Cột `Ngày` | Lưu **serial Excel** (`46239` = 05/08/2026). Mốc: `46023` = 01/01/2026 |
| **Dòng trống gần cạn** | Tháng 8: `other`/`income`/`invest` **đã đầy**, `food` còn **1** dòng. Xem 5.1 |
| Năm của file | **2026** (xác nhận qua `Tóm tắt!F1 = 46023`) |
| Tài khoản OneDrive | **Cá nhân** — `minhgh.personal@gmail.com`, thư mục đồng bộ `D:\Documents\Onedrive` |

### 2.1 Bảng ánh xạ lệnh (nguồn: sheet `Note`, cột J–K)

| Lệnh | Nhãn hiển thị | Tiền tố bảng |
|---|---|---|
| `/food` | Ăn uống sinh hoạt | `food` |
| `/eat_out` | Ăn ngoài | `eat_out` |
| `/transport` | Phương tiện di chuyển | `transport` |
| `/force` | Chi tiêu bắt buộc | `force` |
| `/other` | Linh tinh | `other` |
| `/other_expense` | Chi tiêu khác | `other_expense` |
| `/income` | Thu nhập | `income` |
| `/invest` | Đầu tư | `invest` |
| `/saving` | Tiết kiệm | `saving` |

9 lệnh map **1:1** với 9 tiền tố bảng. Tên bảng đích suy ra trực tiếp: `/food` + ngày trong tháng 8 → `food_8`.

### 2.2 Mã viết tắt (nguồn: sheet `Note`, cột E–F)

`WM` → Winmart · `TC` → TocoToco · `MT` → Mầm Trà · `VM` → V-mart

Bot **đọc bảng mã này trực tiếp từ sheet `Note`** mỗi lần khởi động (có cache). Thêm mã mới = gõ thêm
một dòng trong Excel, không cần sửa code, không cần deploy lại.

### 2.3 Ràng buộc quan trọng nhất: `Tóm tắt` dùng tham chiếu ô cứng

Sheet `Tóm tắt` tổng hợp cả năm bằng địa chỉ ô cố định, **không** phải bằng tên bảng:

```
Tóm tắt!I10  = 'Tháng 8'!N2      ← tổng nhóm Ăn uống của tháng 8
Tóm tắt!I7   = 'Tháng 8'!N9      ← tổng thu nhập
Tóm tắt!I13  = SUM(I10:I12)      ← tổng chi bắt buộc
```

Chuỗi lan truyền từ một lần ghi tới báo cáo năm gồm 4 mắt xích:

```
bot chèn dòng  →  C9                     →  N2                          →  Tóm tắt!I10  →  Tóm tắt!I13
vào food_8        =SUBTOTAL(109,             =food_8[[#Totals],
                    food_8[số tiền])           [số tiền]]
```

Trên sheet tháng, bảng dữ liệu (`A:C`) và bảng tổng hợp (`M:O`) **nằm cùng hàng, cạnh nhau**:

```
        A              B        C          │   M            N
  r1   [tiêu đề]                           │  Phân loại   Số tiền
  r2   Mô tả │ Ngày │ số tiền     ◀ header │  =A1         =food_8 tổng   ◀── Tóm tắt trỏ vào đây
  r3   (trống)                             │  =E1         =other_8 tổng
  r4   cơm trưa │ 46239 │ 40000            │  =A11  ◀──── ô này DỊCH khi chèn dòng
  ...                                      │
  r9   Tổng cộng │       │ =SUBTOTAL(...)  │  =I1         =income_8 tổng
  r10  (trống)                             │
  r11  [tiêu đề Chi tiêu bắt buộc]  ◀──────┴─ M4 trỏ vào đây; chèn dòng đẩy nó xuống A12
  r12  Mô tả │ Ngày │ số tiền   ◀ force_8
```

Mọi thao tác chèn dòng đều làm **dịch chuyển hàng** trong cột `A:C`, kéo theo nguy cơ `Tóm tắt` hoặc
nhãn cột `M` trỏ sai ô — và sai một cách **âm thầm**: sheet vẫn hiện ra những con số trông bình thường,
không có `#REF!`, không cảnh báo.

→ Vì mục 5.1 quyết định **mọi lần ghi đều chèn dòng**, ràng buộc này bị kích hoạt ở mọi tin nhắn. Đó là
lý do bước 0 (mục 11.1) phải kiểm chứng nó trước khi viết bất kỳ dòng code nào.

### 2.4 Kế hoạch cũ trong sheet `Power Automate Flow` — không dùng

Sheet ẩn này mô tả hướng Telegram → Power Automate → bảng "Inbox" cố định. Bị loại vì hai lý do:

1. OneDrive là **tài khoản cá nhân**, không phải M365 Business. Trigger Telegram và HTTP request trong
   Power Automate đều là **premium connector** (~$15/tháng).
2. Nó giả định phải gom vào một bảng Inbox rồi phân loại thủ công sau — trong khi file đã có sẵn 108
   bảng phân loại, ghi thẳng vào đúng chỗ được ngay.

---

## 3. Kiến trúc

```
📱 Telegram  ──webhook──▶  ⚡ Cloudflare Worker  ──Graph API──▶  📊 Excel trên OneDrive
                                    │
                                    └──▶  🗄️ Cloudflare D1
                                          · refresh token Microsoft
                                          · con trỏ /undo
                                          · hàng đợi ghi lại khi lỗi
                                          · nhật ký
```

**Không có bộ phận nào chạy trên máy cá nhân.** Excel được ghi bởi chính engine của Microsoft, nên
`SUBTOTAL` và `Tóm tắt` tự tính lại — bot không đụng vào bất kỳ công thức nào.

### 3.1 Vì sao chọn Cloudflare Workers

| Phương án | Chi phí | Đánh đổi |
|---|---|---|
| **Cloudflare Workers + D1** ✅ | 0đ | Ít bộ phận chuyển động nhất. Webhook → phản hồi <1s. D1 nhất quán mạnh, hợp để lưu refresh token xoay vòng. |
| Deno Deploy / Vercel + Upstash | 0đ | Cần thêm dịch vụ ngoài để lưu state → 3 tài khoản thay vì 2 |
| VPS (Oracle free tier) | 0đ | Toàn quyền, dễ debug, nhưng phải tự vá bảo mật và tự giám sát uptime |

**Chi phí bắt buộc ở mọi phương án:** đăng ký một app trên Azure (miễn phí, ~10 phút, đồng ý quyền một
lần) để bot có quyền ghi OneDrive. Không có đường vòng — Power Automate tính phí, ghi file local trái
với yêu cầu 24/7.

### 3.2 Xác thực Microsoft Graph

- Delegated permission: `Files.ReadWrite` + `offline_access`
- Đồng ý quyền một lần qua trình duyệt → nhận refresh token đầu tiên
- Refresh token của tài khoản cá nhân **xoay vòng**: mỗi lần đổi lấy token mới thì token cũ bị vô hiệu
  → **bắt buộc ghi đè token mới vào D1 trong cùng transaction**, nếu không sẽ mất quyền và phải cấp lại
- Access token (hiệu lực ~1 giờ) được cache trong D1, chỉ làm mới khi sắp hết hạn
- Vì chỉ có một người dùng, độ đồng thời thấp → nguy cơ đua tranh khi làm mới token là tối thiểu; vẫn
  tuần tự hoá thao tác làm mới để chắc chắn

---

## 4. Cú pháp và bộ phân tích

```
/<lệnh>  [ngày]  <mô tả>  <số tiền>
```

Vị trí của **ngày** và **mô tả** linh hoạt — bot quét token, không đọc theo vị trí cứng.

### 4.1 Thuật toán phân tích

1. Tách lệnh ở đầu → xác định nhóm
2. Quét các token, lấy **token cuối cùng** khớp mẫu tiền → số tiền (gỡ khỏi chuỗi)
3. Quét phần còn lại, lấy token khớp mẫu ngày → ngày (gỡ khỏi chuỗi). Không có → hôm nay
4. Phần còn lại ghép lại → mô tả
5. Bung mã viết tắt trong mô tả
6. Mô tả rỗng → báo lỗi, không ghi

Bước 2 chạy **trước** bước 3 và lấy token *cuối cùng*, nên `/food cơm 2 người 80k` cho mô tả
`cơm 2 người` và tiền `80.000` — số `2` không bị nhầm là số tiền.

### 4.2 Phân tích số tiền

| Dạng nhập | Kết quả | Ghi chú |
|---|---|---|
| `40k` `40K` `40n` `40N` | 40.000 | hậu tố nghìn |
| `1tr` `1TR` `1m` `1M` | 1.000.000 | hậu tố triệu |
| `1tr5` | 1.500.000 | chữ số sau `tr` = hàng trăm nghìn |
| `1.5tr` `1,5tr` | 1.500.000 | có hậu tố → dấu chấm/phẩy là **dấu thập phân** |
| `40.000` `40,000` | 40.000 | không hậu tố → dấu chấm/phẩy là **dấu phân cách nghìn** |
| `40000` | 40.000 | |
| `40000đ` `40000d` `40000vnd` | 40.000 | hậu tố tiền tệ được bỏ qua |

Quy tắc phân giải dấu chấm: **có hậu tố đơn vị → dấu thập phân; không hậu tố → phân cách nghìn.**
Nhờ vậy `1.5tr` = 1.500.000 còn `40.000` = 40.000.

### 4.3 Quy tắc "số trần"

"Số trần" = chữ số trơn, không đơn vị, không dấu phân cách.

```
  0 ─────── 999 │ 1000 ─────── 9999 │ 10000 ──────▶
   NHÂN 1000    │   HỎI LẠI (nút)   │  GIỮ NGUYÊN
                │                   │
  40 → 40.000đ  │  1500 → ❓        │ 40000 → 40.000đ
 500 → 500.000đ │  3000 → ❓        │ 25000 → 25.000đ
```

- **≤ 999 → nhân 1000, im lặng.** Ở Việt Nam 2026 không tồn tại khoản chi dưới 1.000đ (mệnh giá nhỏ
  nhất còn lưu hành là 1.000đ), nên số trần ≤ 999 gần như chắc chắn là cách nói tắt của "nghìn".
- **1000–9999 → hỏi lại bằng nút bấm.** Đây là vùng mơ hồ thật: `3000` có thể là gửi xe 3.000đ hoặc
  3 triệu.
- **≥ 10000 → giữ nguyên.** Con số đã tự hợp lý.

```
/food gửi xe 3000
┌─────────────────────────────┐
│ "gửi xe 3000" — ý bạn là?   │
│  [ 3.000đ ]  [ 3.000.000đ ] │
└─────────────────────────────┘
```

**Không bấm gì → không ghi gì.** Im lặng là an toàn, không phải mặc định đoán bừa.

Ràng buộc kỹ thuật: `callback_data` của Telegram giới hạn 64 byte → lưu khoản chi đang chờ vào D1,
chỉ nhét id ngắn vào `callback_data`. Bản ghi chờ hết hạn sau 1 giờ.

### 4.4 Phân tích ngày

| Dạng nhập | Kết quả |
|---|---|
| (không có) | hôm nay |
| `hnay` `hôm nay` `hom nay` | hôm nay |
| `hqua` `hq` `hôm qua` `hom qua` | hôm qua |
| `hkia` `hôm kia` | 2 ngày trước |
| `5/8` `05/08` `5-8` | **ngày/tháng** năm hiện tại → 05/08/2026 |
| `8/8/2026` `8/8/26` | ngày/tháng/năm |

Quy ước **ngày/tháng** (kiểu Việt Nam), không phải tháng/ngày. Token ngày luôn chứa dấu `/`, `-` hoặc
là từ khoá, nên không bao giờ đụng độ với mẫu số tiền.

Múi giờ: **Asia/Ho_Chi_Minh (UTC+7)**. Worker chạy UTC nên phải quy đổi tường minh, nếu không tin nhắn
sau 17:00 UTC sẽ bị ghi sang ngày hôm sau.

---

## 5. Ánh xạ vào Excel

| Bước | Cách làm |
|---|---|
| Chọn bảng | `{tiền tố}_{tháng}` — `/food` + ngày 08/08 → `food_8`. Tra cứu trực tiếp, không dò tìm |
| **Ghi** | **Luôn** `POST /tables/{name}/rows/add` — nối vào cuối bảng. **Một đường ghi duy nhất** |
| Bảng hết chỗ | Không phải trường hợp đặc biệt. `rows/add` tự giãn bảng. **Không cảnh báo gì** |
| Cột `Ngày` | Ghi serial Excel (`46242`) để khớp đúng định dạng dữ liệu cũ |
| Chốt chặn năm | Ngày ngoài năm 2026 → **từ chối ghi**, báo lỗi rõ ràng |

### 5.1 Vì sao luôn chèn dòng, không dò dòng trống

Bản thiết kế đầu định "điền vào dòng trống có sẵn" để tránh làm dịch chuyển cấu trúc, và chỉ chèn dòng
khi bảng đầy. **Số liệu thật cho thấy cách đó vô nghĩa.**

Dòng trống còn lại / tổng dòng dữ liệu, tháng 8:

| food | eat_out | transport | force | other | other_expense | income | invest | saving |
|---|---|---|---|---|---|---|---|---|
| **1**/6 | **1**/1 | 5/5 | 2/3 | **0**/3 | **1**/4 | **0**/1 | **0**/1 | 5/5 |

Ba bảng **đã đầy hẳn**. `/food` — nhóm dùng nhiều nhất — chỉ còn đúng một dòng, tức tin nhắn thứ hai
đã phải chèn.

Đối chiếu với nhịp dùng thật: `other_5` có 51 dòng dữ liệu, `other_7` có 49 — khoảng **50 khoản mỗi
tháng** riêng nhóm "Linh tinh". Template tháng 9–12 chỉ dựng sẵn **3–10 dòng** mỗi bảng (`other_9` có
5). Tức ngay tháng 9 cũng cạn chỗ trong vài ngày đầu.

→ Chèn dòng chiếm khoảng **90% số lần ghi**. Nó là đường chính, không phải ngoại lệ. Giữ hai nhánh chỉ
đổi lấy: hai đường ghi, hai kiểu hoàn tác, hai bề mặt kiểm thử — để tối ưu cho 10% trường hợp.

**Quyết định: bỏ hoàn toàn việc dò dòng trống. Luôn `rows/add`. Không cảnh báo người dùng.**

Các dòng trống rải rác sẵn trong file được giữ nguyên như hiện trạng — chúng vốn đã tồn tại ở mọi
tháng (1–5 dòng mỗi bảng) nên không phải điều bất thường cần dọn.

### 5.2 Hệ quả: rủi ro dồn hết vào `rows/add`

Vì mọi lần ghi đều chèn dòng, ràng buộc ở mục 2.3 giờ được kích hoạt **ở mọi tin nhắn**, không phải
thỉnh thoảng. Khi Graph chèn một dòng vào `food_8`:

- Dòng Tổng cộng của bảng dịch xuống, và mọi thứ bên dưới trong cột `A:C` dịch theo — tiêu đề
  `A11`, bảng `force_8`, bảng `transport_8`
- Vùng `M:O` **không** nằm trong cột của bảng nên về lý thuyết không dịch

Trong file có **hai kiểu tham chiếu**, chịu rủi ro khác nhau:

| Kiểu | Ví dụ | Trỏ vào ô có dịch không | Đánh giá |
|---|---|---|---|
| Tham chiếu có cấu trúc | `N2 = food_8[[#Totals],[số tiền]]` | Bám theo bảng | An toàn về lý thuyết — **mọi con số đều thuộc kiểu này** |
| Tham chiếu ô thường | `M4 = A11` (nhãn nhóm) | **Có dịch** | Phụ thuộc việc Excel tự điều chỉnh tham chiếu khi chèn |

Điểm đáng chú ý: toàn bộ **cột N (số tiền)** dùng tham chiếu có cấu trúc, chỉ **cột M (nhãn)** dùng
tham chiếu ô thường. Nếu điều chỉnh tham chiếu không xảy ra, thứ hỏng là *nhãn*, không phải *số*.

Nhưng đây vẫn là **suy luận, chưa phải quan sát**. Kịch bản xấu nhất — Graph dịch ô mà không kích hoạt
điều chỉnh tham chiếu — sẽ làm `Tóm tắt` sai âm thầm. → Bước 0 tồn tại để loại trừ khả năng này.

**Nếu bước 0 cho thấy `rows/add` làm hỏng `Tóm tắt`: DỪNG LẠI, không tự chữa. Báo lại để bàn hướng
khác.** (Các hướng có thể cân nhắc lúc đó: đổi `Tóm tắt` sang tham chiếu có cấu trúc; giãn sẵn mỗi
bảng vài chục dòng trống rồi quay lại cách điền ô; hoặc tách vùng `M:O` sang sheet riêng.)

### 5.3 Đọc số liệu cho dòng tổng

Một lần đọc **`usedRange`** của sheet tháng là đủ tính cả 3 con số trong phần xác nhận. Không dùng vùng
cố định kiểu `A1:O120`: bảng `other` tăng ~50 dòng mỗi tháng nên biên dưới của sheet trôi liên tục.

Địa chỉ 9 bảng của tháng hiện tại được cache trong D1 để cắt vùng đúng — cache phải **làm mới sau mỗi
lần ghi và mỗi lần hoàn tác**, vì chèn/xoá dòng đều làm dịch chuyển địa chỉ các bảng bên dưới.

→ Tổng cộng khoảng **2 lệnh gọi Graph mỗi tin nhắn**, phản hồi dưới 1 giây.

---

## 6. Format phản hồi

```
✅ cơm trưa · 40.000đ · 08/08 → Ăn uống sinh hoạt

Ăn uống sinh hoạt (T8)      890.000đ
Hôm nay                      75.000đ
Tổng chi T8                3.240.000đ
```

- Dòng đầu là **lớp bắt lỗi**: hiện đúng thứ bot đã hiểu (mô tả, số tiền, ngày, nhóm). Sai là thấy
  ngay và `/undo` được.
- Ba dòng tổng dùng khối `<pre>` của Telegram để các con số thẳng cột trên điện thoại.

---

## 7. Bộ lệnh

| Lệnh | Việc |
|---|---|
| 9 lệnh ghi | `/food` `/eat_out` `/transport` `/force` `/other` `/other_expense` `/income` `/invest` `/saving` |
| `/undo` | Hoàn tác lần ghi gần nhất |
| `/today` | Các khoản hôm nay theo nhóm + tổng |
| `/thang` | Tổng 9 nhóm tháng này + tổng chi + thu nhập (soi gương vùng `M:O`) |
| `/help` | Nhắc cú pháp và liệt kê mã viết tắt hiện có |

### 7.1 `/undo`

Vì mọi lần ghi đều là `rows/add`, hoàn tác = **`DELETE /tables/{name}/rows/itemAt(index=…)`** — xoá
đúng dòng vừa chèn. Một đường ghi, một đường hoàn tác, đối xứng hoàn hảo.

- Chỉ hoàn tác được **lần ghi gần nhất**; xong thì xoá con trỏ, `/undo` lần hai báo "không còn gì để
  hoàn tác"
- Con trỏ lưu trong D1: sheet, tên bảng, chỉ số dòng, giá trị đã ghi, thời điểm
- **Trước khi xoá phải đối chiếu giá trị dòng đó với giá trị đã lưu.** Nếu lệch (bạn đã tự sửa file
  trong lúc đó, hoặc bảng đã dịch chuyển vì lý do khác), bot **từ chối xoá** và báo lại — thà không
  hoàn tác còn hơn xoá nhầm dòng khác
- Xoá dòng cũng làm dịch chuyển cấu trúc y như chèn dòng → phải làm mới `table_cache` sau khi hoàn tác

---

## 8. Bảo mật

Bot có quyền ghi vào OneDrive cá nhân, nên hai lớp khoá:

- **Danh sách trắng Telegram user ID** — chỉ ID của chủ tài khoản được phục vụ. Người lạ nhắn vào: bot
  **im lặng hoàn toàn**, không báo lỗi, không lộ ra rằng nó tồn tại.
- **`secret_token` của Telegram** — đặt khi gọi `setWebhook`, kiểm ở header
  `X-Telegram-Bot-Api-Secret-Token`. Chặn người khác POST thẳng vào URL Worker để giả mạo tin nhắn.
- Bot token, Azure client secret, refresh token nằm trong Worker Secrets / D1 — **không bao giờ nằm
  trong mã nguồn hay trong git**.

---

## 9. Xử lý lỗi

Nguyên tắc: **không bao giờ mất một khoản chi.**

| Tình huống | Bot làm gì |
|---|---|
| Không phân tích được | Báo nó hiểu được gì, gợi ý cú pháp đúng. Không ghi |
| Lệnh không tồn tại | Liệt kê 9 lệnh hợp lệ |
| Mô tả rỗng | Báo thiếu mô tả |
| Access token hết hạn | Tự làm mới, thử lại một lần — người dùng không thấy gì |
| Refresh token chết | Nhắn kèm link cấp quyền lại |
| **Graph lỗi / OneDrive sập** | Cất vào **hàng đợi trong D1**, trả lời *"đã nhận, đang ghi"*, Cron Trigger tự thử lại tới khi thành công |
| Ngày ngoài 2026 | Từ chối ghi — thà báo lỗi còn hơn ghi nhầm tháng |
| `/undo` mà dòng đã đổi | Từ chối xoá, báo lại (xem 7.1) — thà không hoàn tác còn hơn xoá nhầm |
| File đang bị khoá / có người mở | Đưa vào hàng đợi, thử lại |

---

## 10. Trạng thái lưu trong D1

| Bảng | Nội dung |
|---|---|
| `ms_token` | refresh token (xoay vòng), access token, thời điểm hết hạn — một dòng duy nhất |
| `last_write` | Con trỏ `/undo`: sheet, tên bảng, chỉ số dòng, giá trị đã ghi, thời điểm |
| `pending_amount` | Khoản chi chờ người dùng bấm nút chọn số tiền; hết hạn sau 1 giờ |
| `outbox` | Hàng đợi ghi lại khi Graph lỗi: payload, số lần thử, lỗi gần nhất |
| `table_cache` | Địa chỉ 9 bảng của tháng hiện tại, để cắt vùng khi đọc tổng. **Làm mới sau mỗi lần ghi và mỗi lần hoàn tác** — chèn/xoá dòng đều làm dịch chuyển địa chỉ các bảng bên dưới |
| `log` | Nhật ký mọi lần ghi — phục vụ đối chiếu khi nghi ngờ |

---

## 11. Kiểm thử và thứ tự triển khai

| # | Việc | Ước lượng |
|---|---|---|
| **0** | **Spike bắt buộc** (xem 11.1) — cổng chặn, không qua thì không đi tiếp | 45 phút |
| 1 | Đăng ký app Azure + lấy refresh token đầu tiên | 15 phút |
| 2 | Parser + bộ test (~30 ca) — chạy offline, không cần Telegram | ~1 giờ |
| 3 | Worker: webhook → ghi → xác nhận | ~2 giờ |
| 4 | `/undo`, `/today`, `/thang`, nút chọn số tiền | ~2 giờ |
| 5 | Hàng đợi retry + Cron Trigger | ~1 giờ |

Bước 2 đứng trước bước 3 vì parser là phần logic dày nhất mà lại **kiểm thử được hoàn toàn offline** —
không cần Telegram, không cần Graph, không cần deploy. Gỡ lỗi ở đây rẻ hơn nhiều so với gỡ lỗi qua
webhook.

### 11.1 Bước 0 — spike kiểm chứng giả định rủi ro nhất

**Mục đích:** vì mọi lần ghi đều là `rows/add` (mục 5.1), toàn bộ thiết kế tựa lên đúng một giả định:
**chèn dòng vào bảng không phá công thức tổng hợp của file.** Giả định này là **suy luận, chưa phải
quan sát** — Graph API là hộp đen.

**Năm thứ cần kiểm:**

| # | Kiểm chứng | Nếu sai thì sao |
|---|---|---|
| 1 | Graph ghi được vào file 108 bảng này | Cả phương án sụp, phải đổi hướng |
| 2 | **Chèn dòng không làm `Tóm tắt` trỏ sai ô** | Báo cáo năm sai âm thầm — **rủi ro lớn nhất** |
| 3 | Nhãn cột `M` (`M4 = A11`) vẫn trỏ đúng sau khi dòng bên dưới dịch xuống | Nhãn nhóm lệch trong bảng tổng hợp tháng |
| 4 | `SUBTOTAL` và `Tóm tắt` **tự tính lại** | Số vào file nhưng báo cáo đứng im |
| 5 | Serial `46242` hiện thành **08/08/2026**, không phải số trần | Cột Ngày thành rác |

**Các bước:**

1. Nhân bản file trên OneDrive → `Theo dõi chi tiêu - TEST.xlsx`
2. Chụp lại trạng thái trước:
   - Bốn con số: `Tháng 8!C9`, `Tháng 8!N2`, `Tóm tắt!I10`, `Tóm tắt!I13`
   - Chín nhãn ở `Tháng 8!M2:M9` (để kiểm mục 3)
3. Gọi `POST /tables/food_8/rows/add` với `["spike test", 46242, 12345]`
4. Mở file, đối chiếu:
   - Cả 4 con số **tăng đúng 12.345**
   - Chín nhãn `M2:M9` **không đổi chữ nào**
   - Ô ngày hiện `08/08/2026`, không phải `46242`
   - `Tóm tắt!I10` vẫn trỏ tới ô chứa tổng nhóm Ăn uống (kiểm cả *công thức*, không chỉ *giá trị*)
5. **Chèn thêm 5 dòng nữa** rồi kiểm lại y hệt — lỗi dịch chuyển có thể chỉ lộ ra sau nhiều lần chèn
   dồn, khi bảng `force_8` phía dưới bị đẩy qua ranh giới nào đó
6. Thử `DELETE rows/itemAt` một dòng → kiểm lại y hệt (đường `/undo`)
7. Xoá file test

**Nếu bất kỳ mục nào sai: DỪNG, không tự chữa. Báo lại để bàn hướng khác** — các lựa chọn đã phác ở
mục 5.2.

**Vì sao đứng đầu:** làm trước tốn 45 phút; làm sau nghĩa là đã viết parser, Worker, D1, `/undo`, hàng
đợi — vài giờ công — rồi mới phát hiện nền móng không đỡ được. Quan trọng hơn: kiểu hỏng ở đây là
**hỏng âm thầm**, `Tóm tắt` vẫn hiện số trông bình thường nhưng sai, có thể vài tháng sau mới lộ.

**Vì sao trên bản sao:** file thật đã chứa dữ liệu thật từ tháng 1 đến tháng 8. Bước này cố tình chọc
vào phần dễ vỡ nhất để xem nó có vỡ không — không làm việc đó lên bản gốc.

**Lợi ích kèm theo:** đây cũng là bài "hello world" cho chuỗi xác thực Azure (đăng ký app → cấp quyền
→ refresh token → gọi Graph), chứng minh nó chạy thông **trước khi** trộn chung với logic Telegram.

### 11.2 Test parser

Chạy offline, không cần Telegram lẫn Graph. Tối thiểu ~30 ca phủ:

- Mọi dạng số tiền ở mục 4.2
- Cả ba vùng của quy tắc số trần ở mục 4.3
- Mọi dạng ngày ở mục 4.4
- `cơm 2 người 80k` — số trong mô tả không bị nhầm là số tiền
- Bung mã viết tắt
- Các ca lỗi: mô tả rỗng, không có số tiền, lệnh sai, ngày ngoài 2026
- Ranh giới múi giờ: tin nhắn lúc 23:30 giờ Việt Nam phải ghi đúng ngày hôm đó

---

## 12. Ngoài phạm vi phiên bản 1

| Việc | Lý do |
|---|---|
| Sang năm 2027 | File này là của năm 2026. V1 **từ chối** ngày ngoài 2026 thay vì tự xử lý. Xử lý sau khi có file 2027 |
| Sửa khoản chi cũ (ngoài `/undo` lần gần nhất) | Mở Excel sửa tay vẫn nhanh hơn. Chưa đủ giá trị |
| Nhiều khoản trong một tin nhắn | Chưa có nhu cầu |
| Đính kèm ảnh hoá đơn | Ngoài mục tiêu "ghi nhanh gọn" |
| Nhiều người dùng | Chỉ một người |
| Ghi bằng ngôn ngữ tự nhiên (không cần lệnh) | Lệnh rõ ràng và nhanh hơn cho người dùng thành thạo |

---

## 13. Giả định cần kiểm chứng

| # | Giả định | Mức độ | Kiểm ở đâu |
|---|---|---|---|
| **1** | **`rows/add` không làm `Tóm tắt` trỏ sai ô** | **Chặn toàn bộ dự án** | Bước 0 |
| 2 | Excel tự điều chỉnh `M4 = A11` khi dòng bên dưới dịch xuống | Cao (hỏng nhãn) | Bước 0 |
| 3 | Graph kích hoạt tính lại nên `SUBTOTAL` và `Tóm tắt` tự cập nhật | Cao | Bước 0 |
| 4 | Serial ghi vào cột `Ngày` được hiển thị đúng định dạng ngày | Trung bình | Bước 0 |
| 5 | `DELETE rows/itemAt` an toàn tương đương `rows/add` | Trung bình (hỏng `/undo`) | Bước 0 |
| 6 | Refresh token của tài khoản cá nhân sống lâu dài nếu dùng hàng ngày | Trung bình | Vận hành thực tế |
| 7 | Free tier của Cloudflare Workers + D1 đủ cho tải một người dùng | Thấp | Vận hành thực tế |
| 8 | Số trần ≤ 999 luôn có nghĩa là "nghìn" | Thấp | Chấp nhận rủi ro; dòng xác nhận + `/undo` là lưới an toàn |

Giả định 1 giờ là **điểm chịu lực duy nhất** của cả thiết kế. Bản trước còn có phương án lui (điền ô
trống); bỏ nhánh đó đi nghĩa là nếu giả định 1 sai thì không còn đường vòng nào trong thiết kế hiện
tại — phải quay lại bàn (mục 5.2). Đó là lý do bước 0 kiểm nó kỹ hơn mọi thứ khác.
