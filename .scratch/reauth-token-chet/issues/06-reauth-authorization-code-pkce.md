# 06: Đổi `/reauth` sang authorization_code + PKCE — device code không đổi lại được cho tài khoản cá nhân này

**KHẨN CẤP:** bot đang ngưng ghi. Chuỗi refresh token duy nhất từng chạy được đã chết hẳn,
không cứu được (xem "Vì sao bot đang chết" bên dưới). Không có cách khắc phục tạm — `/reauth`
hiện tại (device code) không thể nạp lại kho token, kể cả tạm thời, vì chính điều kiện an toàn
của ticket 02 chặn nó (xem bên dưới). Ticket này phải xong thì bot mới ghi lại được.

**What to build:** Thay luồng device code trong `/reauth` bằng authorization_code + PKCE, redirect
thẳng về một route trên chính Worker. Đây là luồng ĐÃ BIẾT chạy được — chuỗi 417 ký tự giữ bot sống
suốt từ đầu dự án tới hôm nay chính là sinh ra từ luồng này (`scripts/get-refresh-token.mjs`), chỉ
khác là chạy trên máy cá nhân với server cục bộ thay vì trên Worker.

## Vì sao bot đang chết

Ticket 04 chuyển app sang public client thật (redirect URI sang platform "Mobile and desktop
applications", xoá client secret khỏi Azure) và gỡ `client_secret` khỏi mọi nơi gọi endpoint token.
Việc đó đúng và đã xác nhận bằng thực nghiệm — nhưng nó vô tình giết luôn chuỗi refresh token
417 ký tự duy nhất đang chạy: chuỗi đó được cấp cho danh tính confidential từ đầu, tự nó đòi
`client_secret` vĩnh viễn để đổi, bất kể app hiện tại đăng ký là loại gì. Đo lại 2026-09-02
15:42:49Z: đổi chuỗi đó KHÔNG kèm secret → `AADSTS70002: The provided request must include a
'client_secret' input parameter`. Vì secret đã bị xoá khỏi Azure (một phần của ticket 04, không
lùi được), không còn cách nào gửi lại secret hợp lệ nữa — **chuỗi 417 ký tự chết vĩnh viễn**,
không phải lỗi tạm thời.

Đường duy nhất còn lại để nạp kho token là `/reauth`, nhưng nó dùng device code flow, và device
code flow **không đổi lại được** cho tài khoản Microsoft cá nhân này — đo được 5 lần liên tiếp
ngày 2026-09-02, cả từ Worker lẫn từ máy cá nhân, có độ trễ lẫn không:

| # | Nguồn | Có đợi trước khi đổi thử? | Kết quả |
|---|---|---|---|
| 1 | Worker | Không | `AADSTS70000`, Correlation `64c82216-6bd6-487c-93b5-4edeabad0d2c`, 14:40:20Z |
| 2 | Worker | Không (cách lần 1 ~20 phút) | `AADSTS70000`, Correlation `e5740bcb-bdca-47ba-9baa-98bf42567fc0`, 15:01:31Z |
| 3 | Máy cá nhân (`npm run verify:reauth`) | Không | `AADSTS70000`, Correlation `d635e2d8-5c9c-4ced-9090-337adb05ba58`, 15:05:27Z |
| 4 | Máy cá nhân | Có, 30s | `AADSTS70000`, Correlation `20887679-7978-4964-82e1-5577ae65e34a`, 15:30:11Z |
| 5 | Máy cá nhân | Không | `AADSTS70000`, Correlation `4e789b67-19ba-44b7-ad0b-dbb3642c41d6`, 15:35:12Z |

Lỗi luôn y hệt: `AADSTS70000: The user could not be authenticated or user interaction is
required...`. Đã loại trừ từng giả thuyết một:

- **Không phải do Worker/vị trí địa lý** — lần 3-5 chạy thẳng từ máy cá nhân, cùng lỗi.
- **Không phải do client_id sai** — cả hai grant đều vượt qua được cửa kiểm client_secret sạch sẽ
  (không có lỗi thiếu/thừa secret nào), chỉ có thể xảy ra khi đang nói đúng với app đã chuyển.
  Nếu client_id trỏ sai app thì đã gặp lỗi khác (thiếu secret hoặc app không tồn tại).
- **Không phải do lan truyền cấu hình Azure chậm** — lỗi giống hệt sau 20 phút chờ (lần 2).
- **Không phải do đổi lại quá nhanh** — lỗi giống hệt sau khi đợi 30 giây (lần 4).
- **Không phải do consent/scope thiếu** — lần 5 gọi thẳng Microsoft Graph `/v1.0/me/drive` bằng
  chính `access_token` vừa nhận, THÀNH CÔNG (`driveType=personal, owner=Ethan Giang`). Consent
  đầy đủ, access token hợp lệ 100%. Chỉ riêng bước đổi `refresh_token` lấy chuỗi kế tiếp là hỏng.
- **Sign-in logs không thấy gì** — cả 3 Correlation ID trên (kể cả cái từ hơn 2 tiếng trước) đều
  không xuất hiện trong Entra Sign-in logs (`Application sign-ins`, lọc theo service principal
  `telegram-expense-bot`) dù đã đợi đủ lâu để loại trừ độ trễ ghi log thông thường. Gợi ý: lỗi bị
  chặn ở một lớp không tới được pipeline audit bình thường — giống kiểu chặn replay/tốc độ hơn là
  một quyết định chính sách (Conditional Access) thông thường.

Giả thuyết đứng vững nhất: Microsoft coi device code là luồng "thiết bị đầu vào hạn chế, xa" có độ
tin cậy thấp hơn cho tài khoản cá nhân, đặc biệt với scope có quyền ghi (`Files.ReadWrite`), và
không cấp refresh token đổi lại được qua luồng đó cho tài khoản này — bất kể app là loại gì. Chuỗi
417 ký tự (từ authorization_code flow, đăng nhập qua trình duyệt thật, có redirect thật) lại đổi
lại được bình thường suốt từ đầu dự án — đó chính là bằng chứng luồng authorization_code hoạt động
cho tài khoản này, luồng device code thì không.

## Vì sao không vá tạm được

`adoptChainIfUsable` (ticket 02) chỉ ghi đè kho token khi **đổi thử chuỗi mới thành công** — đúng
mục đích ban đầu (không ghi đè chuỗi sống bằng chuỗi chết), nhưng giờ nó chặn luôn chuỗi từ device
code dù access token của chuỗi đó valid 100% (xem thực nghiệm ở trên): đổi thử LUÔN thất bại nên
`/reauth` không bao giờ ghi được gì vào kho, kể cả tạm thời. Đây không phải bug — là hệ quả đúng
của một điều kiện an toàn khi tiền đề của nó (chuỗi đổi thử được là chuỗi tốt) không còn đúng cho
luồng device code trên tài khoản này.

Người dùng đã được hỏi và chọn: làm thẳng bản thiết kế lại thay vì nới lỏng tạm điều kiện an toàn
để câu giờ (phương án đó vẫn khả thi nếu cần gấp hơn — xem "Phương án B" cuối ticket).

## What to build

Thay `handleReauth` (device code) bằng authorization_code + PKCE:

1. Route mới trên Worker, ví dụ `GET /oauth/callback`, nhận `code` từ Microsoft.
2. `/reauth` sinh `code_verifier` + `code_challenge` (S256), cất `code_verifier` cùng chỗ đang cất
   `pending_device_code` (đổi tên bảng/cột cho khớp), trả về link `/authorize` cho người dùng bấm
   thẳng trong Telegram (không cần nhập mã tay).
3. Redirect URI phải trỏ về `https://<worker>.workers.dev/oauth/callback` — cần đăng ký thêm URI
   này trên Azure (nền tảng "Mobile and desktop applications", KHÔNG phải "Web", để giữ app là
   public client — xem ADR ở ticket 05).
4. Route `/oauth/callback` đổi `code` lấy `refresh_token` + `access_token` (grant_type=
   authorization_code, kèm `code_verifier`, KHÔNG kèm secret), rồi chạy qua đúng `adoptChainIfUsable`
   hiện có (không đổi phần đổi-thử-trước-khi-ghi-đè — phần đó đúng và nên giữ).
5. Xoá `src/graph/device.ts` và các bảng/cột riêng cho device code nếu không còn dùng.
6. Cập nhật `docs/SETUP.md` mục 6 (hướng dẫn cấp quyền lại) và `CONTEXT.md`/ADR ticket 05 cho khớp
   luồng mới.

**Blocked by:** None (ticket 04 đã xong phần nó phụ trách; đây là ticket độc lập, khẩn)

**Status:** ready-for-agent (phần agent làm được đã xong — xem Comments; 3 ô còn lại cần Azure
thật + deploy thật + demo thật, không làm được từ mã nguồn)

- [x] Route `/oauth/callback` nhận code, đổi lấy token bằng PKCE, không gửi client_secret
- [x] `/reauth` sinh link authorize + code_verifier, không còn dùng device code
- [ ] Redirect URI mới đã đăng ký trên Azure dưới "Mobile and desktop applications" (việc của người)
- [ ] Chuỗi mới đổi lại được qua `exchangeRefreshToken` — kiểm bằng cách để bot tự refresh sau ít
      nhất một chu kỳ cron (5 phút), không chỉ kiểm access token ban đầu
- [x] `scripts/get-refresh-token.mjs` cập nhật hoặc gỡ bỏ nếu route mới thay thế được vai trò của nó
      — gỡ bỏ, cùng `scripts/verify-reauth.mjs` (đo device code, luồng đã xoá)
- [ ] Demo được: gửi `/reauth` trong chat, bấm link, đăng nhập, bot báo cấp quyền thành công, ghi
      một khoản chi thành công, rồi **đợi hơn 5 phút** và ghi thêm một khoản nữa để xác nhận chuỗi
      thật sự đổi lại được qua ít nhất một vòng xoay (không chỉ sống nhờ access token ban đầu)

## Phương án B — nếu cần bot ghi được ngay trong lúc chờ ticket này

Nới lỏng tạm `adoptChainIfUsable`: chấp nhận chuỗi từ device code ngay cả khi đổi thử thất bại,
miễn `access_token` vừa nhận còn dùng được (không đổi thử bằng refresh_token grant nữa, coi
device_code grant thành công là đủ). Bot ghi được ngay sau `/reauth`, nhưng access token chỉ sống
~1 giờ và không đổi lại được, nên phải gửi `/reauth` lại mỗi lần hết hạn — không bền, chỉ nên dùng
nếu cần chữa cháy trước khi phương án chính ở trên xong.

## Comments

**2026-09-02 — phần agent làm được đã xong, đã review 2 trục (standards + spec).**

`/reauth` giờ sinh PKCE (`src/graph/pkce.ts`) + `state`, cất vào bảng mới `pending_auth`
(migration `0003_pending_auth.sql`, thay `pending_device_code`), gửi thẳng link `/authorize` —
không còn nhập mã tay. Route mới `GET /oauth/callback` (`src/handlers/oauthCallback.ts`) đối
chiếu `state` trước khi tin bất kỳ dữ liệu nào từ query string (route này không có secret header
nào để kiểm), đổi `code` lấy token bằng `exchangeAuthCode` (grant `authorization_code` + PKCE,
KHÔNG secret), rồi chạy qua đúng `adoptChainIfUsable` cũ — không đổi phần đổi-thử-trước-khi-ghi-đè.
Phương án B (nới lỏng điều kiện an toàn) KHÔNG được dùng, đúng như người dùng đã chọn.

`src/graph/device.ts`, `tests/device.test.ts`, `scripts/get-refresh-token.mjs`,
`scripts/verify-reauth.mjs` đã xoá — cả hai script encode luồng đã chết (client_secret cục bộ,
device code polling). `docs/SETUP.md` (đánh số lại mục 1–5), `README.md`, `CONTEXT.md` (thêm mục
từ điển cho PKCE và "nguyên nhân thứ năm") đã cập nhật khớp luồng mới.

`tsc --noEmit` sạch, 245 test xanh (thêm `tests/pkce.test.ts`, `tests/oauth-callback.test.ts`,
viết lại `tests/reauth.test.ts`/`tests/auth.test.ts`/`tests/format.test.ts`).

Review 2 trục (`/code-review since main`, chạy trên `master` vì repo không có nhánh `main`):
- **Standards**: 1 vi phạm cứng — chuỗi `/oauth/callback` lặp lại 3 nơi không qua hằng số, đã sửa
  bằng `OAUTH_CALLBACK_PATH` xuất từ `src/graph/pkce.ts`. Kèm một chỗ tài liệu tự làm lệch chính
  nó (`scripts/lib/dev-vars.mjs` trỏ "mục 6" trong khi diff này đổi thành "mục 5") — đã sửa. Còn
  lại: trùng lặp nhỏ giữa `NO_REFRESH_TOKEN`/`NO_NEXT_LINK` (hai thông điệp gần giống cho hai thời
  điểm khác nhau) — để nguyên, có chủ đích phân biệt được trong Telegram lúc chẩn đoán.
- **Spec**: khớp sát; không có scope creep, Phương án B không lẫn vào. Một khoảng trống: ticket 05
  (ADR về loại đăng ký app) chưa từng được tạo, nên "cập nhật ADR ticket 05" trong ticket này không
  có gì để cập nhật — đây là nợ của ticket 05, không phải của ticket 06.

**Còn lại, không làm được từ mã nguồn:** đăng ký redirect URI thật trên Azure, deploy, và demo thật
(gửi `/reauth`, đăng nhập, ghi một khoản, đợi >5 phút, ghi khoản nữa) — ba ô checklist còn để trống
ở trên. Người dùng cần tự làm ba bước này để đóng ticket.
