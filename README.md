# ReOwn

Chợ đồ cũ cho sinh viên: trả sau, gợi ý theo túi tiền, chấm điểm rủi ro hai chiều.

```bash
npm install && npm run dev            # chỉ giao diện, dữ liệu giả lập — http://localhost:5173

cd apps/api && cp .env.example .env   # Windows: copy .env.example .env
npm install && npm run db:reset && npm run dev   # API — http://localhost:4000/api/health
cd ../.. && npm run dev:api           # giao diện nối API — http://localhost:5173
```

Tài liệu đầy đủ (chức năng, hệ thống điểm, kiến trúc, bảo mật, ảnh sản phẩm): `docs/ReOwn-tai-lieu.html` hoặc `docs/ReOwn-tai-lieu.docx`.

## Triển khai bản demo lên Vercel

Đặt thêm trong Environment Variables của dự án Vercel:

- `CRON_SECRET`: chuỗi ngẫu nhiên (`openssl rand -hex 32`). Vercel tự gửi kèm khi gọi cron. Thiếu biến này thì `/api/cron/jobs` luôn trả 401, vì route đó seed lại toàn bộ CSDL demo.
- `ADMIN_TOTP_SECRET` (khuyến nghị): khi có biến này, số quản trị viên mới nhận mã OTP trên giao diện và phải qua 2FA. Nếu không đặt, bản demo công khai **không** phát mã cho số admin. Chỉ đặt `DEMO_ADMIN_OPEN=true` khi bạn chấp nhận cho mọi người vào trang quản trị.

## Chưa sẵn sàng chạy thật

Các phần sau đang là giả lập, chỉ bật ở bản demo / máy dev. Ở production chúng báo lỗi 503 thay vì âm thầm "thành công":

| Phần | Hiện tại | Cần làm trước khi chạy thật |
|---|---|---|
| Gửi mã OTP | Trả mã về giao diện | Tích hợp nhà cung cấp SMS |
| Xác thực CCCD / ngân hàng / sinh viên | Duyệt mọi giấy tờ | Tích hợp đối tác eKYC |
| Nạp tiền vào ví | Chỉ có nút nạp giả lập (route `/api/dev`) | Tích hợp cổng thanh toán |
| Rút tiền | Ghi nhận thành công ngay | Tích hợp chuyển khoản ngân hàng |
