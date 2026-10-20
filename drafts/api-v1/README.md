# Backend bản nháp (api-v1)

Mã Express/PostgreSQL cũ, migration, test và cấu hình triển khai Vercel cũ. Chỉ giữ để tham khảo khi viết backend mới tại [apps/api/](../../apps/api/); không được gọi hoặc triển khai từ cấu hình dự án hiện tại.

`vercel/` chứa điểm vào serverless cũ. `docker-compose.yml` chứa môi trường PostgreSQL của bản nháp. Tài liệu nghiệp vụ cũ nằm trong [docs/](../../docs/).

Nếu cần chạy lại bản nháp để đối chiếu, cần cài dependencies riêng, cấu hình PostgreSQL riêng và kiểm tra các thao tác `db:reset` trước khi thực hiện vì lệnh này xóa dữ liệu trong database được cấu hình.
