---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src"]
---

## Scope

Toàn bộ web app ReOwn (src/): trang chủ, tìm kiếm, sản phẩm, shop, tài khoản, kênh người bán, đăng nhập, hỗ trợ. Mode: Operate (người dùng đang mua / bán).

## Audience & job

Sinh viên tìm và mua đồ cũ vừa túi tiền, trên điện thoại hoặc laptop; người bán quản lý đơn. Ban giám khảo phải thấy ngay trả sau, gợi ý theo túi tiền, uy tín người bán.

## Constraints

Giữ nguyên chức năng, luồng, nội dung, dữ liệu. Người dùng thấy bản cũ "quá nhiều màu" và "chữ nhỏ, khó đọc".

## Direction contract

THESIS: Sàn TMĐT quen tay kiểu Shopee/TGDĐ, chơi thẳng, nhưng yên: mỗi thẻ chỉ nói ba điều — món gì, bao nhiêu (trả thẳng hoặc mỗi tháng), người bán có đáng tin không. Từ chối kiểu sàn ồn: banner chạy, dãy màu, nhãn chồng nhãn.
OWN-WORLD: Nền trắng và xám rất nhạt; một màu nhấn xanh lá ReOwn cho hành động, lựa chọn và dấu uy tín; đỏ chỉ cho cảnh báo rủi ro; giá in đậm màu mực. Một họ chữ Be Vietnam Pro, cỡ gốc 16px. Thẻ bo 12px, một kiểu viền mỏng, không đổ bóng nặng. Icon SVG nét 1.75.
STORY: Vào là thấy ô tìm kiếm và "món vừa túi tiền của bạn"; chạm một món thấy ngay giá, góp mỗi tháng, người bán hạng mấy; đặt hàng trong hai chạm.
FIRST VIEWPORT: Header trắng: logo trái, ô tìm kiếm rộng ở giữa (nút xanh), Đơn mua/Tài khoản phải; hàng danh mục chữ. Dưới: dải chào tĩnh một màu xanh nhạt gồm tiêu đề lớn, một câu, một nút, và ba cam kết có icon; ngay dưới là hàng danh mục icon và khối gợi ý theo túi tiền.
FORM: canon (lối ra chuẩn của danh mục), người dùng chọn; seed 64ebb3e0 (vòng chạy thiếu challenger).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
