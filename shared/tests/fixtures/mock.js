const V = (phone, cccd, bank, student = false) => ({ phone, cccd, bank, student });
const rv = (by, stars) => ({ by, stars });

export const USERS = [
  {
    id: 'u_minh', phone: '0900000001', name: 'Nguyễn Minh', school: 'HUIT · năm 1', demo: 'Sinh viên mới, chưa có lịch sử',
    verify: V(true, false, false, true), accountAgeMonths: 0,
    finance: { monthlyIncome: 2_000_000, savings: 600_000, otherDebtMonthly: 0 },
    buyer: { orders: 0, boms: 0, disputesLost: 0, repayment: { onTime: 0, late: 0, severe: 0, defaults: 0 }, sellerRatings: [] },
    seller: { sales: 0, reviews: [], shippedOnTime: 0, shipTotal: 0, cancels: 0, disputesLost: 0 },
  },
  {
    id: 'u_lan', phone: '0900000002', name: 'Trần Ngọc Lan', school: 'HUIT · năm 3', demo: 'Uy tín cao, trả đúng hạn',
    verify: V(true, true, true, true), accountAgeMonths: 14,
    finance: { monthlyIncome: 3_500_000, savings: 1_500_000, otherDebtMonthly: 0 },
    buyer: { orders: 9, boms: 0, disputesLost: 0, repayment: { onTime: 12, late: 1, severe: 0, defaults: 0 }, sellerRatings: [5, 5, 4, 5, 5] },
    seller: { sales: 4, reviews: [rv('u_s1', 5), rv('u_s2', 5)], shippedOnTime: 4, shipTotal: 4, cancels: 0, disputesLost: 0 },
  },
  {
    id: 'u_huy', phone: '0900000003', name: 'Lê Quốc Huy', school: 'HUIT · năm 2', demo: 'Từng trả trễ, từng bom hàng',
    verify: V(true, true, false, false), accountAgeMonths: 7,
    finance: { monthlyIncome: 2_500_000, savings: 400_000, otherDebtMonthly: 300_000 },
    buyer: { orders: 4, boms: 1, disputesLost: 1, repayment: { onTime: 3, late: 2, severe: 1, defaults: 0 }, sellerRatings: [3, 4, 2] },
    seller: { sales: 0, reviews: [], shippedOnTime: 0, shipTotal: 0, cancels: 0, disputesLost: 0 },
  },
  {
    id: 'u_s1', phone: '0900000011', name: 'Phạm Gia Bảo', school: 'HUIT · năm 4', verify: V(true, true, true, true), accountAgeMonths: 18,
    finance: { monthlyIncome: 4_000_000, savings: 3_000_000 },
    buyer: { orders: 6, boms: 0, repayment: { onTime: 9, late: 0, severe: 0, defaults: 0 }, sellerRatings: [5, 5] },
    seller: { sales: 27, reviews: [rv('u_lan', 5), rv('u_s2', 5), rv('u_s3', 4), rv('b1', 5), rv('b2', 5), rv('b3', 5), rv('b4', 4), rv('b5', 5)], shippedOnTime: 26, shipTotal: 27, cancels: 0, disputesLost: 0 },
  },
  {
    id: 'u_s2', phone: '0900000012', name: 'Đỗ Thu Hà', school: 'UEH · năm 3', verify: V(true, true, true, false), accountAgeMonths: 9,
    finance: { monthlyIncome: 3_000_000, savings: 1_000_000 },
    buyer: { orders: 3, boms: 0, repayment: { onTime: 4, late: 0, severe: 0, defaults: 0 }, sellerRatings: [5] },
    seller: { sales: 11, reviews: [rv('u_lan', 5), rv('b1', 4), rv('b2', 5), rv('b3', 4), rv('b6', 5)], shippedOnTime: 10, shipTotal: 11, cancels: 0, disputesLost: 0 },
  },
  {
    id: 'u_s3', phone: '0900000013', name: 'Võ Thành Tâm', school: 'HCMUTE · năm 2', verify: V(true, true, false, true), accountAgeMonths: 5,
    finance: { monthlyIncome: 2_000_000, savings: 500_000 },
    buyer: { orders: 2, boms: 0, repayment: { onTime: 2, late: 0, severe: 0, defaults: 0 }, sellerRatings: [] },
    seller: { sales: 5, reviews: [rv('b4', 4), rv('b5', 3), rv('u_huy', 5)], shippedOnTime: 4, shipTotal: 5, cancels: 1, disputesLost: 0 },
  },
  {
    id: 'u_s4', phone: '0900000014', name: 'shop_passdo_gia_re', school: 'Không rõ', verify: V(true, false, false, false), accountAgeMonths: 1,
    finance: { monthlyIncome: 0, savings: 0 },
    buyer: { orders: 0, boms: 0, repayment: { onTime: 0, late: 0, severe: 0, defaults: 0 }, sellerRatings: [] },
    seller: { sales: 3, reviews: [rv('x1', 5), rv('x2', 5), rv('x3', 5)], shippedOnTime: 1, shipTotal: 3, cancels: 2, disputesLost: 2 },
  },
  {
    id: 'u_admin', phone: '0999999999', name: 'Quản trị ReOwn', school: 'ReOwn', role: 'admin', demo: 'Quản trị viên',
    verify: V(true, true, true, false), accountAgeMonths: 12,
    finance: { monthlyIncome: 0, savings: 0, otherDebtMonthly: 0 },
    buyer: { orders: 0, boms: 0, disputesLost: 0, repayment: { onTime: 0, late: 0, severe: 0, defaults: 0 }, sellerRatings: [] },
    seller: { sales: 0, reviews: [], shippedOnTime: 0, shipTotal: 0, cancels: 0, disputesLost: 0 },
  },
];

const H = 3_600_000;
export const SAMPLE_ORDERS = [
  { id: 'o_d1', productId: 'x_d1', title: 'Tai nghe AirPods Pro (rep 1:1)', price: 450_000, buyerId: 'b2', buyerName: 'Sinh viên 2', sellerId: 'u_s4', method: 'full', status: 'disputed', payoutStatus: 'held', createdAt: Date.now() - 50 * H, category: 'phone', icon: 'headphones',
    dispute: { status: 'open', reason: 'Nhận được hàng nhái, không kết nối được với iPhone, hộp không có tem như ảnh.', openedAt: Date.now() - 6 * H } },
  { id: 'o_d2', productId: 'x_d2', title: 'Nồi chiên không dầu 3.5L', price: 520_000, buyerId: 'b5', buyerName: 'Sinh viên 5', sellerId: 'u_s3', method: 3, status: 'disputed', payoutStatus: 'held', createdAt: Date.now() - 80 * H, category: 'home', icon: 'ricecooker',
    dispute: { status: 'open', reason: 'Nồi bị móp một góc và thiếu khay phụ, mô tả ghi là đủ phụ kiện.', openedAt: Date.now() - 20 * H } },
];

export const EXTRA_REVIEWER_SCORES = { b1: 78, b2: 70, b3: 66, b4: 58, b5: 72, b6: 81, x1: 22, x2: 20, x3: 25 };

export const CATEGORIES = [
  { id: 'laptop', label: 'Laptop, PC', icon: 'laptop' },
  { id: 'phone', label: 'Điện thoại, tablet, âm thanh', short: 'Điện thoại', icon: 'phone' },
  { id: 'study', label: 'Sách & đồ học tập', short: 'Đồ học tập', icon: 'book' },
  { id: 'fashion', label: 'Thời trang', icon: 'jacket' },
  { id: 'home', label: 'Đồ gia dụng', short: 'Gia dụng', icon: 'ricecooker' },
];

const LOCATIONS = { u_s1: 'Tân Phú', u_s2: 'Quận 3', u_s3: 'Thủ Đức', u_s4: 'Quận 5', u_lan: 'Tân Phú', u_huy: 'Tân Phú', u_minh: 'Tân Phú' };

const P = (id, title, category, price, condition, sellerId, desc, icon, daysAgo, cover) =>
  ({ id, title, category, price, condition, sellerId, desc, icon, cover, location: LOCATIONS[sellerId], daysAgo, sold: false });

export const PRODUCTS = [
  P('p1', 'Laptop Dell Latitude 7490 i5 / 8GB / 256GB', 'laptop', 3_200_000, 85, 'u_s1', 'Máy dùng văn phòng, pin còn ~3 tiếng, bàn phím đầy đủ, có sạc zin. Phù hợp học Office, lập trình cơ bản.', 'laptop', 2, 'dell-latitude-7490.jpg'),
  P('p2', 'Laptop Lenovo ThinkPad T480 i5 / 16GB', 'laptop', 4_500_000, 88, 'u_s2', 'RAM 16GB, SSD 512GB, màn 14" FHD. Có vết xước nhẹ ở nắp.', 'laptop', 5, 'thinkpad-t480.jpg'),
  P('p3', 'MacBook Air 2017 13" i5 / 8GB', 'laptop', 5_200_000, 80, 'u_s1', 'Pin 78%, sạc 520 lần. Máy chạy êm, đã cài sẵn macOS Monterey.', 'laptop', 8, 'macbook-air-2017.jpg'),
  P('p4', 'Laptop HP Elitebook 840 G5 (giá sốc)', 'laptop', 1_600_000, 90, 'u_s4', 'Máy đẹp như mới, cần tiền bán gấp. Chuyển khoản trước giao sau.', 'laptop', 1, 'hp-elitebook-840-g5.jpg'),
  P('p5', 'iPhone XR 64GB xanh', 'phone', 2_900_000, 82, 'u_s2', 'Pin 84%, Face ID ok, màn zin. Tặng kèm ốp lưng.', 'phone', 3, 'iphone-xr.jpg'),
  P('p6', 'Samsung Galaxy A52 128GB', 'phone', 2_100_000, 86, 'u_s3', 'Máy chính hãng, có hộp, sạc nhanh 25W.', 'phone', 4, 'galaxy-a52.jpg'),
  P('p7', 'Xiaomi Redmi Note 11 4/64', 'phone', 1_500_000, 84, 'u_s3', 'Dùng làm máy phụ, còn bảo hành 2 tháng.', 'phone', 9, 'redmi-note-11.jpg'),
  P('p8', 'Máy tính Casio fx-580VN X', 'study', 350_000, 92, 'u_s1', 'Dùng 1 học kỳ, còn nguyên hộp và sách hướng dẫn.', 'calculator', 1, 'casio-fx-580vn-x.jpg'),
  P('p9', 'Combo giáo trình Kinh tế vi mô + vĩ mô', 'study', 120_000, 75, 'u_s2', 'Có ghi chú highlight các phần quan trọng.', 'book', 6, 'giao-trinh-kinh-te.jpg'),
  P('p10', 'Bàn học gấp gọn + đèn LED', 'study', 280_000, 80, 'u_s3', 'Nhận tại KTX khu B, ĐHQG.', 'desk', 7, 'ban-hoc-gap.jpg'),
  P('p11', 'Áo khoác Uniqlo Ultra Light Down size M', 'fashion', 390_000, 90, 'u_s2', 'Mặc 3–4 lần, không phai màu.', 'jacket', 2, 'uniqlo-ultra-light-down.jpg'),
  P('p12', 'Giày Converse Chuck 70 size 41', 'fashion', 550_000, 78, 'u_s1', 'Đế còn tốt, đã giặt sạch.', 'shoes', 10, 'converse-chuck-70.jpg'),
  P('p13', 'Nồi cơm điện Sharp 1L', 'home', 250_000, 85, 'u_s3', 'Nấu vừa cho 1–2 người, lòng nồi chống dính còn tốt.', 'ricecooker', 3, 'noi-com-sharp.jpg'),
  P('p14', 'Quạt đứng Senko + ổ cắm Điện Quang', 'home', 180_000, 80, 'u_s1', 'Combo cho phòng trọ mới chuyển đến.', 'fan', 5, 'quat-dung-senko.jpg'),
  P('p15', 'Tai nghe Sony WH-CH520', 'phone', 650_000, 88, 'u_s2', 'Pin 50 giờ, kết nối Bluetooth 5.2.', 'headphones', 1, 'sony-wh-ch520.jpg'),
  P('p16', 'Màn hình Dell 24" P2419H', 'laptop', 1_700_000, 87, 'u_s1', 'Tấm nền IPS, có chân xoay dọc, phù hợp code.', 'monitor', 4, 'dell-p2419h.jpg'),
  P('p17', 'Bàn phím cơ Akko 3068B Plus', 'laptop', 690_000, 88, 'u_s2', 'Switch Akko CS Jelly Pink, kết nối 3 chế độ. Đủ hộp, keycap zin.', 'keyboard', 2, 'akko-3068b.jpg'),
  P('p18', 'iPad Gen 9 64GB Wi-Fi', 'phone', 4_300_000, 90, 'u_s1', 'Pin 91%, không trầy màn, kèm bút cảm ứng không hãng.', 'tablet', 6, 'ipad-gen-9.jpg'),
  P('p19', 'Loa bluetooth JBL Go 3', 'phone', 520_000, 85, 'u_s3', 'Chống nước IP67, âm to rõ, còn hộp.', 'speaker', 8, 'jbl-go-3.jpg'),
  P('p20', 'Bộ sách IELTS Cambridge 15–18', 'study', 160_000, 80, 'u_s2', 'Bản in đẹp, chưa viết vào, kèm file nghe.', 'book', 3, 'ielts-cambridge.jpg'),
  P('p21', 'Balo laptop Mikkor 15.6"', 'fashion', 250_000, 82, 'u_s3', 'Ngăn chống sốc, quai còn chắc.', 'backpack', 11, 'balo-mikkor.jpg'),
  P('p22', 'Ấm siêu tốc Philips 1.7L', 'home', 190_000, 88, 'u_s1', 'Đun nhanh, tự ngắt khi sôi. Dùng 3 tháng.', 'kettle', 2, 'am-sieu-toc-philips.jpg'),
  P('p23', 'Đèn học chống cận Rạng Đông', 'study', 150_000, 85, 'u_s3', 'Ánh sáng trung tính, 3 mức sáng.', 'lamp', 5, 'den-hoc-rang-dong.jpg'),
  P('p24', 'Samsung Galaxy Tab A7 Lite 32GB', 'phone', 1_900_000, 83, 'u_s2', 'Phù hợp đọc tài liệu, học online. Có ốp.', 'tablet', 7, 'galaxy-tab-a7-lite.jpg'),
];

export const PAST_ORDERS = [
  ...Array(9).fill({ category: 'study', buyerIncome: 1_800_000 }),
  ...Array(7).fill({ category: 'home', buyerIncome: 2_000_000 }),
  ...Array(6).fill({ category: 'phone', buyerIncome: 2_400_000 }),
  ...Array(4).fill({ category: 'laptop', buyerIncome: 2_600_000 }),
  ...Array(3).fill({ category: 'fashion', buyerIncome: 1_200_000 }),
  ...Array(8).fill({ category: 'laptop', buyerIncome: 3_800_000 }),
  ...Array(4).fill({ category: 'phone', buyerIncome: 3_500_000 }),
];
