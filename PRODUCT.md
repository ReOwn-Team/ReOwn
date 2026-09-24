# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Sinh viên mua đồ cũ (chính):** sinh viên năm 1–4, 18–23 tuổi, thu nhập 1–3 triệu/tháng (gia đình, làm thêm). Cần laptop, điện thoại, sách, đồ gia dụng nhỏ cho phòng trọ. Không đủ tiền mua một lần và sợ bị lừa khi mua đồ cũ online. Dùng điện thoại và máy tính ngang nhau.
- **Người bán đồ cũ:** sinh viên muốn pass lại đồ; sợ người mua bom hàng, không thanh toán.
- **Ban giám khảo UII Sandbox 2026 (FinTech):** cần thấy ngay ba điểm khác biệt khi xem demo.

## Product Purpose

Chợ đồ cũ cho sinh viên, xây quanh tài chính và niềm tin chứ không chỉ quanh việc đăng tin. Thành công = sinh viên mua được món cần ngay (không đợi đủ tiền), không bị lừa; người bán pass đồ nhanh và chắc được nhận tiền.

## Positioning

Kết hợp ba thứ mà các sàn đồ cũ ở Việt Nam chưa làm cùng lúc:
1. **Trả sau 3–6 kỳ** (3 kỳ 0% phí), duyệt theo điểm uy tín — đối tác tài chính có giấy phép cho vay, ReOwn là nền tảng.
2. **Gợi ý theo túi tiền:** người dùng nhập thu nhập / tiền đang có, hệ thống chỉ gợi ý món trả nổi.
3. **Chấm điểm rủi ro hai chiều:** cả người mua và người bán có điểm 0–100, hạng A–E, tính từ xác thực và giao dịch thật; review chỉ tính sau giao dịch hoàn tất.
Cộng với **tiền giữ hộ (escrow):** người bán chỉ nhận tiền khi người mua xác nhận.

## Operating Context

- Luồng mua: tìm / lướt → xem món → chọn trả thẳng hoặc trả sau → đặt hàng (tiền giữ hộ) → nhận hàng / khiếu nại → trả kỳ.
- Luồng bán: đăng tin → đơn đến → gửi hàng trong 3 ngày → nhận tiền vào ví.
- Tham khảo quen thuộc của người dùng: Shopee, TikTok Shop, Thế Giới Di Động, Chợ Tốt.
- Prototype được trình diễn trước ban giám khảo (demo 3 phút) và dùng thử bởi sinh viên.

## Capabilities and Constraints

- React + Vite SPA; hai chế độ: dữ liệu giả lập trong trình duyệt, hoặc nối backend Express + PostgreSQL.
- Engine chấm điểm dùng chung client/server (`shared/scoring`); hạn mức theo hạng (A 6tr/6 kỳ … D, E chỉ trả thẳng); luật cứng: chưa CCCD thì không trả sau, hồ sơ mỏng tối đa hạng C, góp ≤30% thu nhập (thu nhập tự khai tính tối đa 3 triệu, 8 triệu nếu xác thực ngân hàng), trả trước theo hạng (A 0% · B 10% · C 20%); giá tham chiếu do ReOwn tính, tin kéo giao dịch ra ngoài sàn bị chặn; mỗi người mua chỉ tính một đánh giá cho mỗi người bán.
- Người bán tải tối đa 3 ảnh/tin (nén trên máy, server mã hoá lại WebP, lưu trong PostgreSQL); dữ liệu mẫu vẫn dùng hình minh hoạ SVG. Bản demo không có máy chủ lưu ảnh trong trình duyệt. Có chat mua–bán theo từng tin (chặn tin nhắn đòi chuyển khoản ngoài sàn), thông báo trong app và nhắc hạn trả kỳ (SMS mô phỏng), tìm kiếm không dấu / chịu gõ sai, sửa tin khi chưa có người đặt. Có trang quản trị (tổng quan rủi ro, tranh chấp, kiểm duyệt tin, người dùng, nhật ký; admin bắt buộc 2 lớp). Chưa có vận chuyển.
- Bản demo online là trang tĩnh: chỉ được tải font từ Google Fonts, không ảnh ngoài.
- Ngôn ngữ giao diện: tiếng Việt.

## Brand Commitments

- Tên **ReOwn** (viết Re + Own). Ngoài tên, giao diện được thiết kế lại tự do.
- Giao diện theo chuẩn sàn TMĐT quen thuộc (đặt cạnh Shopee, TikTok Shop, Thế Giới Di Động), nhưng gọn và yên hơn: ít màu, chữ đủ lớn, ít nhãn trên mỗi thẻ. Người dùng đã chọn hướng này thay vì một phong cách riêng lạ.

## Evidence on Hand

- Khảo sát nhanh 15 sinh viên HUIT: 80% muốn mua đồ cũ nhưng thiếu tiền, 73% lo bị lừa, 60% không biết món nào vừa túi tiền.
- Không có đánh giá khách hàng, số liệu người dùng, logo đối tác hay báo chí thật — không được bịa.

## Product Principles

1. Tiền và niềm tin phải nhìn thấy được: giá, số tiền góp mỗi tháng và độ uy tín người bán luôn đi cùng nhau.
2. Không cho vay vượt sức trả; giải thích rõ vì sao được / không được trả sau.
3. Ít chữ, ít bước: sinh viên phải tìm và mua được trong vài chạm.
4. Minh bạch: mọi điểm số có lý do; không phô số liệu hay lời hứa không có thật.
