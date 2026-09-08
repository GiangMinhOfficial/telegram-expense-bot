# 05: Ghi lại nguyên nhân thứ năm của "hết hiệu lực xác thực" và quyết định loại client

**What to build:** Người đọc kế tiếp — người hay agent — nhìn từ điển thuật ngữ là thấy ngay ca này,
và không suy ra lại cái giả định đã làm hỏng bot.

Từ điển đang định nghĩa "hết hiệu lực xác thực" có **bốn** nguyên nhân cần bốn cách sửa. Ca vừa rồi
là nguyên nhân **thứ năm**, và nó khác bốn cái kia ở một điểm quan trọng: chuỗi token được cấp ra
bình thường, người dùng không thu hồi gì, kho token không trống, secret không hết hạn — chỉ là
chuỗi đó chưa bao giờ đổi được. Triệu chứng trễ đúng một giờ vì access token vẫn dùng tốt, nên
cách chẩn đoán "bot vừa mất quyền, chắc do vừa làm gì đó" chỉ ra sai chỗ.

Dấu vân tay phân biệt nó với bốn cái kia, đáng ghi lại vì nó rẻ và dứt khoát: **access token gọi
Graph vẫn 200 trong khi refresh token cùng grant đó trả `invalid_grant`**.

Quyết định về loại đăng ký app cần một ADR, vì nó không đọc ra được từ mã nguồn và đã bị suy sai
một lần: "Allow public client flows" không phải công tắc chuyển app sang public client, nó chỉ mở
thêm luồng. Loại client do nền tảng của redirect URI quyết định. Ghi lại kết luận này kèm hai mã
lỗi đã đo, để lần sau ai đó định bỏ secret thì có cái mà đối chiếu.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Từ điển thuật ngữ ghi nguyên nhân thứ năm, kèm dấu vân tay phân biệt nó với bốn nguyên nhân kia
- [ ] Có ADR về loại đăng ký app: quyết định gì, vì sao, đo bằng mã lỗi nào
- [ ] ADR nói rõ giả định nào đã sai và nó gây ra hậu quả gì, không chỉ chép lại kết luận đúng
- [ ] Không có chỗ nào trong tài liệu còn khẳng định bật public client flows là hết cần secret
