import Link from "next/link";
const topics = [
  { id: "about", title: "Về ReOwn", text: "ReOwn là không gian mua bán đồ đã qua sử dụng dành cho sinh viên. Chúng mình xây dựng trải nghiệm giúp bạn xem rõ tình trạng món đồ, biết mức giá và lựa chọn cách nhận trước khi giao dịch. Sản phẩm hiện đang trong giai đoạn thử nghiệm." },
  { id: "partnership", title: "Hợp tác với ReOwn", text: "ReOwn đang trong giai đoạn thử nghiệm. Kênh tiếp nhận đề nghị hợp tác chưa được mở trên website; thông tin liên hệ chính thức sẽ được cập nhật tại đây khi sẵn sàng." },
  {
    id: "buy",
    title: "Hướng dẫn mua hàng",
    text: "Tìm món đồ phù hợp, đọc tình trạng và lỗi đã công bố, chọn hình thức nhận hàng rồi kiểm tra tổng tiền trước khi tạo đơn. Trong demo, thanh toán không trừ tiền thật.",
  },
  {
    id: "sell",
    title: "Hướng dẫn đăng bán",
    text: "Thêm ảnh rõ nét, ghi đúng tình trạng, lỗi đã biết và giá bán. Bản nháp được giữ trên thiết bị. Sau khi gửi, tin chờ quản trị viên xem xét. Bạn có thể xem kết quả kiểm tra ảnh, chỉnh sửa và gửi duyệt lại, ẩn hoặc xóa tin theo trạng thái.",
  },
  {
    id: "installments",
    title: "Thanh toán theo kỳ",
    text: "Giá sản phẩm luôn là giá tổng. Demo chia tổng thanh toán thành 3, 6, 9 hoặc 12 kỳ; kỳ cuối nhận phần làm tròn. Phí trả sau giả định bằng 0 trong demo. Chưa có dịch vụ tín dụng hoặc đối tác trả sau được tích hợp.",
  },
  {
    id: "safety",
    title: "An toàn giao dịch",
    text: "Kiểm tra món đồ và nội dung mô tả trước khi nhận. Đánh giá và xác thực danh tính là hai thông tin riêng; xác thực không bảo đảm chất lượng món đồ. Không nhập thông tin thanh toán hoặc giấy tờ thật vào bản demo.",
  },
  {
    id: "report",
    title: "Báo cáo vi phạm",
    text: "Tính năng tiếp nhận báo cáo chưa kết nối hệ thống hỗ trợ. Bản demo không gửi báo cáo đến người bán hoặc đội vận hành.",
  },
  {
    id: "contact",
    title: "Liên hệ hỗ trợ",
    text: "Đây là bản trải nghiệm giao diện, chưa có kênh hỗ trợ trực tuyến. Bạn có thể đặt lại dữ liệu ở cuối trang để bắt đầu lại.",
  },
  {
    id: "terms",
    title: "Điều khoản sử dụng bản demo",
    text: "Các sản phẩm, đơn hàng, đánh giá và thanh toán là dữ liệu minh họa. Không hình thành giao dịch mua bán hay khoản vay thật. Chính sách vận hành chính thức sẽ được cung cấp trước khi sản phẩm ra mắt.",
  },
  {
    id: "privacy",
    title: "Bảo mật dữ liệu demo",
    text: "Tài khoản được xác thực bằng API ReOwn. Phiên đăng nhập dùng cookie HttpOnly; mật khẩu không được lưu trên trình duyệt. Dữ liệu marketplace và ảnh sản phẩm demo lưu trong IndexedDB. Đặt lại demo chỉ xóa dữ liệu mô phỏng; dùng Đăng xuất để kết thúc phiên tài khoản.",
  },
];
export const metadata = { title: "Trung tâm trợ giúp" };
export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  const selected = topics.find((t) => t.id === topic);
  return (
    <div className="container page">
      <div>
        <h1>{selected?.title ?? "Trung tâm trợ giúp"}</h1>
        <p className="muted">Thông tin dành cho bản trải nghiệm ReOwn.</p>
      </div>
      <div className="two-column">
        <div className="stack">
          {(selected ? [selected] : topics).map((t) => (
            <section className="panel" key={t.id}>
              <h2>{t.title}</h2>
              <p>{t.text}</p>
            </section>
          ))}
        </div>
        <nav className="panel stack" aria-label="Chủ đề trợ giúp">
          {topics.map((t) => (
            <Link
              className="text-link"
              key={t.id}
              href={`/help?topic=${t.id}`}
              aria-current={selected?.id === t.id ? "page" : undefined}
            >
              {t.title}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
