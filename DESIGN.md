---
name: ReOwn
description: Chợ đồ cũ cho sinh viên — sàn TMĐT quen tay, bản yên tĩnh, người dùng tự chọn sáng/tối và màu chủ đạo
colors:
  ground: "#f4f6f9"
  surface: "#ffffff"
  surface-2: "#f8f9fb"
  sunken: "#eef1f5"
  ink: "#172033"
  ink-2: "#3d4659"
  muted: "#5d6677"
  line: "#e3e7ee"
  line-2: "#d2d8e1"
  accent: "#2563eb"
  accent-hover: "#1d4ed8"
  accent-soft: "#edf3fe"
  accent-text: "#1d4ed8"
  good: "#15803d"
  good-soft: "#e9f6ee"
  risk: "#c9372c"
  risk-soft: "#fdeeed"
  warn-soft: "#fdf6e7"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "2.375rem"
    fontWeight: 800
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "11px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 18px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  product-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  pay-option-selected:
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
---

# ReOwn design system

## Overview

Chuẩn sàn TMĐT Việt Nam (Shopee, TikTok Shop, Thế Giới Di Động) chơi thẳng, nhưng **yên**: nền trắng / xám rất nhạt, một màu nhấn duy nhất, chữ đủ lớn. Mỗi thẻ sản phẩm chỉ nói ba điều — món gì, bao nhiêu (trả thẳng hoặc góp mỗi tháng), người bán có đáng tin không. Giao diện là chế độ Operate: quen tay trước, cá tính nằm ở chi tiết chính xác.

## Colors

- **Màu chủ đạo (accent):** mặc định xanh dương `#2563eb`; người dùng đổi được sang xanh lá `#0b7a5b`, cam `#c2410c`, tím `#7c3aed`. Chỉ dùng cho hành động chính, lựa chọn đang bật, liên kết và tiền góp mỗi tháng. Không dùng làm trang trí. Mỗi màu có bản sáng và bản tối riêng (token `--acc-l`, `--acc-d`), đều đạt ≥4.5:1 với chữ.
- **`accent-soft`** sinh tự động bằng `color-mix` (8% trên nền sáng, 11% trên nền tối), nên đổi màu chủ đạo không cần định nghĩa lại.
- **Xanh lá `good` chỉ cho "đáng tin"** (người bán hạng A/B, lý do tích cực), cố định, không đổi theo màu chủ đạo.
- **Đỏ `risk` chỉ cho rủi ro:** người bán hạng D/E, tin có dấu hiệu lừa đảo, lỗi, lý do không đủ điều kiện trả sau.
- **Giá in màu mực** (`ink`, đậm), không tô màu.
- Nền trung tính hơi ngả xanh lạnh (`ground` #f4f6f9), chữ mực xanh đen (#172033) thay cho đen thuần, dịu mắt hơn.
- Hình minh hoạ sản phẩm trung tính (`sunken` + nét `ink-2`).
- Chế độ tối được thiết kế riêng (nền #0f131a → mặt #161b24), không đảo màu máy móc. Chế độ: Sáng / Tối / Theo máy.

## Typography

Một họ chữ **Be Vietnam Pro**, tự host (@fontsource, bộ Latin + tiếng Việt, 400–800). Cỡ đọc chính 16px; sàn nhỏ nhất cho thông tin trên thẻ là 14px; 13px (`caption`) chỉ cho chú thích phụ. Tỉ lệ bậc ~1.2. Số tiền dùng `tabular-nums`.

## Layout

Khung tối đa 1200px, lề 20px (16px trên điện thoại). Nhịp khoảng cách 4/8/16/24/32/48. Trang chủ theo thứ tự: dải chào → khối "Món vừa túi tiền của bạn" (phải thấy trong khung nhìn đầu) → danh mục → hai dãy sản phẩm → lưới gợi ý. Lưới sản phẩm `auto-fill minmax(200px)`, 2 cột trên điện thoại. Dưới 640px: header thu thành logo + ô tìm kiếm, thanh điều hướng dưới 5 mục, trang sản phẩm có thanh mua dính đáy.

## Elevation & Depth

Phẳng, phân lớp bằng tông: `ground` → `surface` → `surface-2`/`sunken`. Viền 1px `line` là cách tách mặc định. Bóng (`0 1px 2px + 0 6px 20px`, độ mờ thấp) chỉ xuất hiện khi hover thẻ, trên dropdown gợi ý tìm kiếm và thẻ mẫu ở dải chào.

## Shapes

Bo 12px cho thẻ/panel, 8px cho nút, ô nhập, lựa chọn thanh toán; pill cho chip, ô tìm kiếm, nút sắp xếp. Dải chào bo 20px. Không lồng thẻ trong thẻ.

## Components

- **Ảnh sản phẩm:** ảnh người bán (cắt vuông `cover` trên thẻ, `contain` trên nền `sunken` ở trang chi tiết); tin chưa có ảnh dùng hình minh hoạ SVG. Trang chi tiết: ảnh chính + mũi tên + đếm `1/3` + dải ảnh nhỏ (viền 2px màu chủ đạo cho ảnh đang xem), vuốt trên điện thoại. Form đăng tin: lưới 3 ô vuông, ảnh đầu gắn nhãn "Ảnh bìa", ô thêm ảnh viền đứt.
- **Thẻ sản phẩm:** ảnh vuông → tên 2 dòng → giá đậm → "hoặc X/tháng" (số màu nhấn) → hàng cuối có vạch mảnh: dấu uy tín + khu vực. Không % giảm, không giá gạch, không nhãn chồng trên ảnh (trừ "Đã bán").
- **Dấu uy tín:** icon khiên + "Hạng A"; bản dài "Hạng A · Uy tín cao". Rủi ro: icon cảnh báo đỏ.
- **Lựa chọn thanh toán:** danh sách dọc; đang chọn = viền 2px nhấn + nền `accent-soft` + dấu check; không đủ điều kiện = viền đứt, chữ xám, lý do màu đỏ.
- **Nút:** chính (nền nhấn), ghost (nền trắng viền `line-2`); cao tối thiểu 44px.
- **Tab / menu:** gạch chân 2px màu nhấn cho tab; menu tài khoản đang chọn = nền trắng + chữ màu nhấn.
- **Icon:** một bộ SVG nét 1.75 (`src/components/Icon.jsx`).
- **Menu giao diện:** nút tròn icon bảng màu ở cuối header (cả điện thoại); mở bảng nhỏ gồm nút chia 3 (Sáng/Tối/Theo máy) và 4 chấm màu có tên. Lựa chọn lưu trong trình duyệt và áp dụng trước khi trang hiện (script trong `index.html`), không nháy màu.

## Do's and Don'ts

- Do: giữ tối đa một màu chủ đạo trên mỗi vùng; để giá, tiền góp và uy tín luôn đi cùng nhau.
- Do: giải thích mọi trạng thái "không được" bằng một câu cụ thể.
- Don't: thêm banner chạy, dãy màu, nhãn % giảm, huy hiệu nhiều màu.
- Don't: dùng ký tự Unicode/emoji làm icon, nhãn nhỏ viết hoa phía trên tiêu đề, sọc màu bên trái thẻ.
- Don't: chữ dưới 14px cho thông tin người dùng cần đọc để quyết định mua.
