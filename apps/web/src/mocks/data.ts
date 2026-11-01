export type Product = {
  live?: boolean;
  sellerId?: string;
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  condition: string;
  seller: string;
  rating: string;
  posted: string;
  description: string;
  defects: string;
  location: string;
  images?: string[];
  sold?: boolean;
  deliveryModes?: Array<"shipping" | "meetup">;
};
export const categories = [
  "Tất cả",
  "Laptop",
  "Điện thoại",
  "Phụ kiện",
  "Sách",
  "Đồ dùng",
  "Sở thích",
];
export const products: Product[] = [
  {
    id: "laptop",
    name: "Laptop học tập 14 inch",
    price: 1000000,
    image: "/figma/laptop.png",
    category: "Laptop",
    condition: "Dùng tốt",
    seller: "Minh Anh",
    rating: "4,8 (10)",
    posted: "12 phút trước",
    description:
      "Mình chuyển sang thiết bị khác nên nhượng lại chiếc laptop đang dùng để học. Máy phù hợp soạn tài liệu, học trực tuyến và lướt web. Có kèm sạc. Bạn có thể kiểm tra bàn phím, màn hình và các cổng kết nối trước khi nhận.",
    defects: "Vỏ có trầy nhẹ; pin sử dụng khoảng 2 giờ tùy tác vụ.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "headphones",
    name: "Tai nghe chụp tai không dây",
    price: 450000,
    image: "/figma/headphones.png",
    category: "Phụ kiện",
    condition: "Ít sử dụng",
    seller: "Hoàng Nam",
    rating: "4,9 (8)",
    posted: "25 phút trước",
    description:
      "Tai nghe dùng học và nghe nhạc, kết nối Bluetooth ổn định. Kèm dây sạc.",
    defects: "Đệm tai có dấu sử dụng nhẹ.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "books",
    name: "Bộ sách cho kỳ học mới",
    price: 180000,
    image: "/figma/books.png",
    category: "Sách",
    condition: "Có ghi chú",
    seller: "Thu Hà",
    rating: "5,0 (6)",
    posted: "38 phút trước",
    description:
      "Bộ sách đã dùng trong kỳ học trước, đủ trang, phù hợp tham khảo và tự học.",
    defects: "Một số trang có gạch chân và ghi chú.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "chair",
    name: "Ghế cho góc học tập",
    price: 350000,
    image: "/figma/chair.png",
    category: "Đồ dùng",
    condition: "Dùng tốt",
    seller: "Quốc Bảo",
    rating: "Chưa có đánh giá",
    posted: "45 phút trước",
    description: "Ghế vải chân gỗ chắc chắn, phù hợp bàn học hoặc phòng trọ.",
    defects: "Mặt vải có vết sử dụng nhỏ.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "phone",
    name: "Điện thoại cho nhu cầu cơ bản",
    price: 1500000,
    image: "/figma/phone.png",
    category: "Điện thoại",
    condition: "Dùng tốt",
    seller: "Gia Huy",
    rating: "4,7 (12)",
    posted: "1 giờ trước",
    description:
      "Điện thoại dùng liên lạc, đọc tin và học trực tuyến. Có thể kiểm tra khi nhận.",
    defects: "Pin đã qua sử dụng, viền có xước nhỏ.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "camera",
    name: "Máy ảnh cho người mới bắt đầu",
    price: 1800000,
    image: "/figma/camera.png",
    category: "Sở thích",
    condition: "Có trầy nhẹ",
    seller: "Phương Linh",
    rating: "4,9 (9)",
    posted: "1 giờ trước",
    description: "Máy ảnh nhỏ gọn để bắt đầu tập chụp. Kèm dây đeo và sạc pin.",
    defects: "Vỏ trầy nhẹ, hoạt động bình thường.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "weekend-books",
    name: "Sách đọc thêm cuối tuần",
    price: 95000,
    image: "/figma/books.png",
    category: "Sách",
    condition: "Còn tốt",
    seller: "Ngọc Mai",
    rating: "5,0 (3)",
    posted: "2 giờ trước",
    description: "Một vài cuốn sách muốn trao lại cho người đọc tiếp theo.",
    defects: "Bìa có nếp gấp nhỏ.",
    location: "TP. Hồ Chí Minh",
  },
  {
    id: "study-headphones",
    name: "Tai nghe dành cho học online",
    price: 290000,
    image: "/figma/headphones.png",
    category: "Phụ kiện",
    condition: "Dùng tốt",
    seller: "Tuấn Minh",
    rating: "4,8 (5)",
    posted: "2 giờ trước",
    description: "Tai nghe có micro dùng cho học trực tuyến và cuộc gọi.",
    defects: "Dây sạc không đi kèm.",
    location: "TP. Hồ Chí Minh",
  },
];
export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + "₫";
export type Address = {
  id: string;
  name: string;
  phone: string;
  detail: string;
  label: string;
  isDefault: boolean;
};
export const initialAddresses: Address[] = [
  {
    id: "home",
    name: "Nguyễn An",
    phone: "0901 234 567",
    detail: "12 Nguyễn Văn Bảo, Phường Hạnh Thông, TP. Hồ Chí Minh",
    label: "Nhà riêng",
    isDefault: true,
  },
  {
    id: "dorm",
    name: "Nguyễn An",
    phone: "0901 234 567",
    detail: "Ký túc xá sinh viên, TP. Hồ Chí Minh",
    label: "Ký túc xá",
    isDefault: false,
  },
];
export type OrderStatus =
  | "Chờ thanh toán"
  | "Chờ xác nhận"
  | "Chuẩn bị hàng"
  | "Đang giao"
  | "Hoàn tất"
  | "Đã hủy";
export type MockOrder = {
  id: string;
  productId: string;
  status: OrderStatus;
  months: number;
  delivery: "shipping" | "meetup";
  total: number;
  address: Address;
  note: string;
  product?: Product;
  createdAt?: string;
  paid?: boolean;
  review?: { stars: number; text: string };
  rejection?: string;
};
export type Listing = Product & {
  productId: string;
  status: "Đang hiển thị" | "Đã ẩn" | "Đã bán" | "Chờ duyệt" | "Bị từ chối";
  reviewStatus?: "not_required" | "pending" | "approved" | "rejected";
  rejectionReason?: string | null;
  revision?: number;
};
export type ListingDraft = {
  title: string;
  category: string;
  price: string;
  condition: string;
  description: string;
  defects: string;
  location: string;
  shipping: boolean;
  meetup: boolean;
  images: string[];
};
export const emptyDraft: ListingDraft = {
  title: "",
  category: "Laptop",
  price: "",
  condition: "Dùng tốt",
  description: "",
  defects: "",
  location: "TP. Hồ Chí Minh",
  shipping: true,
  meetup: true,
  images: [],
};
export const initialOrders: MockOrder[] = [
  {
    id: "RO-DEMO-001",
    productId: "laptop",
    status: "Chờ thanh toán",
    months: 1,
    delivery: "shipping",
    total: 1030000,
    address: initialAddresses[0],
    note: "Vui lòng liên hệ trước khi giao hàng.",
  },
  {
    id: "RO-DEMO-002",
    productId: "phone",
    status: "Đang giao",
    months: 1,
    delivery: "shipping",
    total: 1530000,
    address: initialAddresses[0],
    note: "",
    paid: true,
  },
  {
    id: "RO-DEMO-003",
    productId: "books",
    status: "Hoàn tất",
    months: 1,
    delivery: "meetup",
    total: 180000,
    address: initialAddresses[0],
    note: "",
    paid: true,
  },
];
export const initialListings: Listing[] = [
  products[0],
  products[1],
  products[2],
].map((p, index) => ({
  ...p,
  seller: "Nguyễn An",
  productId: `own-${p.id}`,
  id: `own-${p.id}`,
  status: index === 1 ? "Đã ẩn" : index === 2 ? "Đã bán" : "Đang hiển thị",
}));
export const initialSales: MockOrder[] = [
  {
    id: "RO-SALE-001",
    productId: "own-laptop",
    product: initialListings[0],
    status: "Chờ xác nhận",
    months: 3,
    delivery: "shipping",
    total: 1030000,
    address: {
      ...initialAddresses[0],
      name: "Trần Minh",
      detail: "28 Nguyễn Kiệm, Phường Đức Nhuận, TP. Hồ Chí Minh",
    },
    note: "Vui lòng liên hệ trước khi giao hàng.",
    paid: true,
  },
];
export function installmentPlan(total: number, months: number): number[] {
  const regular = Math.floor(total / months);
  return Array.from({ length: months }, (_, index) =>
    index === months - 1 ? total - regular * (months - 1) : regular,
  );
}
