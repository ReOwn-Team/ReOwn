# ReOwn

Chợ đồ cũ cho sinh viên: trả sau, gợi ý theo túi tiền, chấm điểm rủi ro hai chiều.

```bash
npm install && npm run dev            # chỉ giao diện, dữ liệu giả lập — http://localhost:5173

cd server && copy .env.example .env   # macOS/Linux: cp
npm install && npm run db:reset && npm run dev   # API — http://localhost:4000/api/health
cd .. && npm run dev:api              # giao diện nối API — http://localhost:5173
```

Tài liệu đầy đủ (chức năng, hệ thống điểm, kiến trúc, bảo mật, ảnh sản phẩm): `docs/ReOwn-tai-lieu.html` hoặc `docs/ReOwn-tai-lieu.docx`.
