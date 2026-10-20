# ReOwn

Chợ đồ cũ cho sinh viên: trả sau, gợi ý theo túi tiền, chấm điểm rủi ro hai chiều.

```bash
npm install && npm run dev            # giao diện demo, dữ liệu giả lập — http://localhost:5173
```

## Cấu trúc hiện tại

- [apps/web/](apps/web/): frontend React, trang HTML và tài nguyên tĩnh.
- [apps/api/](apps/api/): vị trí dành cho backend mới; chưa có mã chạy.
- [drafts/api-v1/](drafts/api-v1/): backend cũ và cấu hình triển khai để tham khảo; không triển khai.
- [shared/](shared/): logic hiện dùng cho giao diện demo, có thể dùng lại khi viết API mới.
- [docs/](docs/): tài liệu thiết kế và nghiệp vụ, mô tả cả backend cũ.
- [.github/workflows/](.github/workflows/): kiểm tra frontend demo tự động.

Vercel hiện chỉ build frontend demo. Route API và cron cũ đã tắt. Bỏ trống hoặc xóa biến `VITE_API_URL` trên Vercel rồi redeploy để dùng dữ liệu giả lập.

Tài liệu thiết kế trước khi viết lại: `docs/ReOwn-tai-lieu.html` hoặc `docs/ReOwn-tai-lieu.docx`.
