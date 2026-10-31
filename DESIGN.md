# ReOwn Design Guidelines

> Phiên bản 0.1 · Ngày 19/10/2026 · Bản định hướng thiết kế đề xuất
>
> Dành cho Nguyễn Viết Hiếu và nhóm ReOwn. Dùng làm tài liệu chung khi thiết kế, xây dựng hoặc nhờ AI triển khai giao diện website.

## 1. Mục đích và phạm vi

ReOwn là nền tảng mua bán đồ cũ dành cho sinh viên, kết hợp gợi ý theo khả năng chi trả, thông tin uy tín hai chiều và lựa chọn thanh toán trả thẳng hoặc trả sau qua đối tác.

Concept thiết kế: **Chợ sinh viên đáng tin, mua trong khả năng của mình.**

Giao diện phải giúp người mua trả lời được ba câu hỏi trước khi đặt hàng:

1. Món đồ này có đáp ứng nhu cầu và có tình trạng thực tế như thế nào?
2. Mình có những thông tin gì để đánh giá người bán?
3. Tổng tiền phải trả, tiền từng kỳ và thời điểm thanh toán là bao nhiêu?

Thiết kế ưu tiên website responsive, dùng thuận tiện trên điện thoại. Ứng dụng di động native thuộc giai đoạn phát triển sau. Các quy tắc trong file này là baseline đề xuất, cần tiếp tục kiểm chứng bằng prototype và phản hồi người dùng.

### Cơ sở nội dung

- `ReOwn_Thuyet_minh_du_an_2026.docx`: chức năng, khách hàng, luồng mua bán và phạm vi MVP.
- `R.pdf`: nhận diện cam–đen, định hướng sản phẩm và vai trò Full-stack Developer của Nguyễn Viết Hiếu.
- Những lựa chọn chi tiết về màu, kích thước, component và cách tổ chức màn hình bên dưới là đề xuất thiết kế mới.

Không đưa số liệu khảo sát, dự báo thị trường hay cam kết tài chính từ tài liệu dự án lên giao diện như các dữ kiện đã được xác minh. Các tài liệu đang có khác biệt về một số số liệu; chúng không ảnh hưởng đến baseline UI này.

## 2. Người dùng và nhiệm vụ chính

| Người dùng | Nhiệm vụ | Thông tin cần thấy sớm |
| --- | --- | --- |
| Sinh viên mua đồ | Tìm đồ phù hợp nhu cầu và ngân sách | Giá đầy đủ, tình trạng, khoảng cách, thông tin người bán |
| Sinh viên cân nhắc trả sau | Hiểu khoản phải trả trước khi lựa chọn | Tổng trả, từng kỳ, ngày đến hạn, phí và điều kiện áp dụng |
| Người có đồ muốn bán | Đăng món đồ và theo dõi giao dịch | Các bước đăng tin, trạng thái xác thực, phí, số tiền dự kiến nhận |
| Người đang có giao dịch | Biết cần làm gì tiếp theo | Trạng thái đơn, hành động hiện tại, hạn thanh toán hoặc phản hồi |

## 3. Nguyên tắc trải nghiệm

### 3.1. Cho khám phá trước khi yêu cầu thông tin

- Cho xem và tìm sản phẩm trước khi đăng nhập.
- Yêu cầu đăng nhập khi lưu yêu thích, đăng bán hoặc tiếp tục giao dịch.
- Hỏi nhu cầu và ngân sách khi người dùng mở tính năng gợi ý.
- Cho phép bỏ qua bước cá nhân hóa và thay đổi thông tin sau đó.
- Thu nhập là thông tin riêng tư; giải thích mục đích trước khi hỏi và không hiển thị công khai.

### 3.2. Giá đầy đủ luôn rõ hơn giá từng kỳ

- Giá sản phẩm là giá chính trên thẻ và trang chi tiết.
- Giá từng kỳ là thông tin bổ sung, luôn đi cùng số kỳ.
- Không dùng giá từng kỳ để làm người dùng hiểu nhầm giá của món đồ.
- Hiển thị trả thẳng và trả sau với mức độ dễ tiếp cận tương đương; không tự chọn trả sau.
- Trước khi xác nhận đơn phải thấy phí vận chuyển, phí dịch vụ, phí trả sau nếu có và tổng tiền cuối cùng.

### 3.3. Uy tín phải có giải thích

- Phân biệt đánh giá sao, xác thực danh tính và điểm tín nhiệm nội bộ.
- Đánh giá sao phải đi cùng số lượng đánh giá thực, không suy ra từ số giao dịch.
- Cho xem nguồn dữ liệu, thời điểm cập nhật hoặc cách giải thích phù hợp với từng chỉ số.
- Xác thực danh tính không đồng nghĩa với bảo đảm chất lượng hàng hóa.
- Tài khoản mới dùng nhãn “Chưa có đánh giá”, không gán đánh giá thấp hoặc tạo điểm giả.
- Với thông tin người mua, người bán chỉ thấy tín hiệu cần cho giao dịch. Không công khai thu nhập, lịch sử trả nợ hoặc giấy tờ cá nhân.

### 3.4. Tình trạng đồ cũ là nội dung cốt lõi

- Mỗi món đồ có ảnh thật, mô tả tình trạng, lỗi đã biết và phụ kiện đi kèm.
- Dùng các nhãn có định nghĩa rõ như “Đã qua sử dụng”, “Có lỗi cần lưu ý”.
- Không dùng “99%” hoặc “như mới” làm mô tả duy nhất về tình trạng.
- Thông tin bảo hành phải nêu ai bảo hành và điều kiện nếu có.

### 3.5. Gợi ý hỗ trợ quyết định

- Cho biết lý do một món được gợi ý: ngân sách, nhu cầu hoặc khu vực.
- Cho sửa tiêu chí và xem sản phẩm khác.
- Không kết luận “Bạn chắc chắn đủ khả năng chi trả” chỉ dựa vào thu nhập khai báo.
- Gợi ý sản phẩm, điểm tín nhiệm và quyết định duyệt trả sau là ba kết quả riêng biệt.
- Khi không có kết quả phù hợp, giải thích tiêu chí đang giới hạn và cho chỉnh lại.

## 4. Nhận diện thị giác

### 4.1. Tính cách

Ấm áp, rõ ràng, gần gũi với sinh viên và cẩn thận với thông tin giao dịch. Ảnh sản phẩm và nội dung có vai trò chính; trang trí hỗ trợ nhận diện.

- Nền kem nhẹ, bề mặt trắng, chữ than đậm.
- Cam đất dành cho hành động chính và điểm nhấn thương hiệu.
- Xanh lá dành cho các trạng thái xác nhận hoặc hoàn tất có dữ liệu hỗ trợ.
- Icon nét mảnh, góc bo vừa phải, bóng đổ nhẹ.
- Giữ logo chính thức của nhóm. Không vẽ lại hoặc thay font logo bằng chữ thông thường khi có asset gốc.

### 4.2. Màu sắc

| Token | Giá trị | Công dụng |
| --- | --- | --- |
| `--color-brand` | `#B84B22` | CTA chính, lựa chọn đang được chọn |
| `--color-brand-hover` | `#9D3D19` | Hover CTA chính |
| `--color-on-brand` | `#FFFFFF` | Chữ trên nền cam đất |
| `--color-brand-soft` | `#FBEDE5` | Nền nhấn nhẹ |
| `--color-background` | `#FFFDF9` | Nền trang |
| `--color-surface` | `#FFFFFF` | Card, form, menu, dialog |
| `--color-surface-muted` | `#F3EEE5` | Nền khu vực phụ hoặc ảnh đang tải |
| `--color-text` | `#242821` | Nội dung chính |
| `--color-text-muted` | `#62675E` | Nội dung phụ trên nền sáng |
| `--color-border` | `#E4E0D7` | Đường phân cách và viền trang trí |
| `--color-control-border` | `#85897E` | Viền control cần nhận diện rõ |
| `--color-success` | `#296044` | Thành công, xác thực |
| `--color-success-soft` | `#EDF4EE` | Nền trạng thái thành công |
| `--color-warning` | `#80510A` | Nhắc hạn, cần chú ý |
| `--color-warning-soft` | `#FFF4DC` | Nền nhắc hạn |
| `--color-danger` | `#B42318` | Lỗi, thao tác hủy hoặc xóa |
| `--color-danger-soft` | `#FFF0EE` | Nền lỗi |
| `--color-focus` | `#2459A6` | Vòng focus khi dùng bàn phím |

Không dùng cam cho mọi tiêu đề, icon và viền. Trạng thái luôn đi kèm chữ hoặc icon; không truyền đạt ý nghĩa chỉ bằng màu.

### 4.3. Typography

Font giao diện: **Be Vietnam Pro**. Fallback: `Inter, system-ui, sans-serif`. Chỉ tải các weight thực sự cần: 400, 500, 600, 700.

| Vai trò | Desktop | Mobile | Weight | Line height |
| --- | --- | --- | --- | --- |
| Tiêu đề trang | 32px | 26px | 700 | 1.25 |
| Tiêu đề khu vực | 24px | 21px | 600 | 1.35 |
| Tiêu đề card | 16px | 16px | 600 | 1.4 |
| Nội dung | 16px | 16px | 400 | 1.6 |
| Label và button | 14px | 14px | 500–600 | 1.4 |
| Nội dung phụ | 14px | 14px | 400 | 1.5 |
| Caption | 12px | 12px | 400 | 1.5 |
| Giá trên trang chi tiết | 28px | 26px | 700 | 1.2 |

- Input trên điện thoại dùng font tối thiểu 16px.
- Số tiền và lịch trả dùng `font-variant-numeric: tabular-nums` khi cần căn hàng.
- Không viết hoa toàn bộ đoạn dài. Không dùng caption cho phí, điều kiện quan trọng hoặc lỗi cần xử lý.

### 4.4. Khoảng cách và hình khối

- Thang spacing: `4, 8, 12, 16, 24, 32, 48, 64px`.
- Padding card: 16px mobile, 20–24px desktop.
- Bo góc: control 10px, card 14px, dialog 20px. Pill chỉ dành cho tag ngắn.
- Bóng nổi nhẹ: `0 4px 18px rgb(36 40 33 / 6%)`.
- Icon phổ biến: 20px; icon điều hướng 24px. Dùng một bộ icon thống nhất như Lucide.
- Icon trong nút phải đi cùng nhãn hoặc có tên truy cập nếu chỉ có icon.

## 5. Layout và responsive

| Kích thước | Bố cục đề xuất |
| --- | --- |
| Dưới 768px | Một cột, gutter 16px, điều hướng đáy, nội dung ưu tiên thao tác bằng ngón tay |
| 768–1023px | Gutter 24px, grid sản phẩm 3 cột, bộ lọc mở theo yêu cầu |
| Từ 1024px | Header đầy đủ, bộ lọc bên trái, grid sản phẩm 3–4 cột tùy vùng còn lại |

- Container nội dung tối đa 1200px, căn giữa. Grid desktop dùng 12 cột.
- Grid sản phẩm trên mobile dùng 2 cột khi card còn đủ rộng; chuyển 1 cột ở chiều rộng dưới 360px.
- Trang sản phẩm desktop: ảnh và tình trạng bên trái; giá, người bán và thanh toán bên phải.
- Trang sản phẩm mobile: ảnh → tên và giá → tình trạng tóm tắt → người bán → thanh toán → chi tiết bổ sung.
- Thanh CTA đáy có thể sticky trên mobile. Chừa khoảng cuối trang và safe area để không che nội dung hoặc focus.
- Bottom navigation và thanh CTA không được chồng lên nhau; trong checkout dùng layout tập trung vào giao dịch.
- Không dùng chiều cao màn hình cố định cho nội dung dài. Không tạo thanh cuộn ngang cho toàn trang.

## 6. Kiến trúc thông tin

Điều hướng mobile gồm: **Khám phá · Yêu thích · Đăng bán · Giao dịch · Tài khoản**.

Desktop giữ cùng cấu trúc, đặt tìm kiếm trong header và làm nổi bật nút “Đăng bán”. Tính năng gợi ý theo túi tiền nằm trong Khám phá, có lối vào rõ ràng nhưng không chiếm toàn bộ trang chủ.

Khu vực Giao dịch chia thành “Mua”, “Bán” và “Lịch trả sau”. Tài khoản chứa hồ sơ, xác thực, cài đặt và hỗ trợ. Nếu bổ sung nhắn tin, cung cấp lối vào từ người bán và hộp thư; tránh thay đổi điều hướng chỉ để phục vụ bản demo.

## 7. Quy định từng màn hình

### 7.1. Khám phá

Thứ tự nội dung:

1. Khu vực hiện tại và tìm kiếm với placeholder “Bạn đang cần món gì?”.
2. Danh mục ngắn: Laptop, Điện thoại, Đồ học tập, Đồ gia dụng, Thời trang.
3. Lối vào “Tìm món vừa túi tiền”.
4. Danh sách sản phẩm với bộ lọc nhu cầu, giá, tình trạng và khu vực.

Không dùng banner lớn làm sản phẩm bị đẩy xuống quá sâu. Không hiển thị ngân sách, khoảng cách hoặc đề xuất cá nhân hóa như dữ liệu thật nếu chưa có đầu vào tương ứng.

### 7.2. Tìm món vừa túi tiền

- Bước 1: chọn món cần mua và nhu cầu sử dụng.
- Bước 2: nhập ngân sách tổng; có thể bổ sung mức chi mỗi tháng hoặc thu nhập nếu người dùng muốn.
- Bước 3: xem nhóm kết quả nhỏ kèm lý do gợi ý và nút chỉnh tiêu chí.
- Chỉ hiển thị mức trả từng kỳ khi món và phương thức đó có dữ liệu áp dụng.
- Không tự coi thu nhập là ngân sách mua sắm. Nếu hỏi thu nhập, giải thích riêng mục đích sử dụng dữ liệu.
- Nếu chỉ vận hành bằng bộ quy tắc, không viết nội dung khiến người dùng hiểu là đã có tư vấn tài chính cá nhân chuyên sâu.

### 7.3. Chi tiết sản phẩm

Các khối bắt buộc:

- Gallery ảnh thật: toàn bộ món đồ, chi tiết và ảnh lỗi nếu có.
- Tên, giá đầy đủ, vị trí, thời điểm đăng.
- Hồ sơ món đồ: tình trạng, thông số, lỗi đã biết, phụ kiện, bảo hành nếu có.
- Người bán: tên hiển thị, đánh giá và số đánh giá, trạng thái xác thực, giao dịch hoàn tất.
- Hành động xem hồ sơ hoặc cơ sở đánh giá.
- Chọn phương thức thanh toán có sẵn.
- CTA “Tiếp tục” đưa đến kiểm tra đơn, không đặt hàng ngay.

Giữ thông tin uy tín trong vùng người dùng thấy trước khi quyết định. Không giấu toàn bộ khối này sau accordion hoặc dưới danh sách sản phẩm liên quan.

### 7.4. Kiểm tra đơn và thanh toán

Thứ tự: món đồ → giao nhận → phương thức thanh toán → bảng chi phí → xác nhận.

- Giữ nguyên phương thức người dùng đã chọn ở trang sản phẩm.
- Trả sau phải hiển thị số kỳ, số tiền từng kỳ, ngày đến hạn, phí, tổng trả và đối tác cung cấp khi có tích hợp thật.
- Nêu rõ trạng thái: chưa kiểm tra, đang kiểm tra, cần bổ sung thông tin, đủ điều kiện hoặc không khả dụng theo kết quả hệ thống.
- Không dùng mức trả dự kiến làm bằng chứng đã được duyệt.
- Nếu phương thức không khả dụng, giải thích và cho chuyển sang lựa chọn còn dùng được, giữ lại dữ liệu đơn.
- Nút cuối: “Đặt hàng” hoặc hành động chính xác theo bước tích hợp thực tế. Không dùng “Xác nhận” cho mọi bước.
- Sau thao tác, hiển thị trạng thái đang xử lý và ngăn gửi lặp. Chỉ báo thành công khi nhận được kết quả xác nhận.

### 7.5. Giao dịch và lịch trả sau

- Hiển thị trạng thái đơn bằng timeline có nhãn chữ, thời gian và việc cần làm tiếp theo.
- Phân biệt tiến độ giao hàng với trạng thái thanh toán.
- Lịch trả sau có số tiền, hạn thanh toán, trạng thái và lịch sử của từng kỳ.
- Tách “Đã thanh toán”, “Sắp đến hạn”, “Quá hạn” và “Đang đối soát”.
- Không chỉ ghi “Còn 3 ngày”; hiển thị thêm ngày cụ thể.
- Đơn có vấn đề có lối vào yêu cầu hỗ trợ hoặc báo cáo, kèm trạng thái xử lý.

### 7.6. Đăng bán

Chia ba bước có lưu nháp:

1. Ảnh và tình trạng: ảnh thật, tên, danh mục, mô tả, lỗi đã biết.
2. Giá và giao nhận: giá bán, khu vực, phương thức giao nhận, phí và số tiền dự kiến nhận nếu đã xác định.
3. Xem trước: kiểm tra tin, xem yêu cầu xác thực và đăng bán.

Cho tạo nháp trước khi hoàn tất xác thực. Khi đăng chính thức, chỉ yêu cầu các thông tin thực sự cần theo chính sách đang áp dụng. Báo rõ tin đang chờ duyệt, đã hiển thị, cần sửa hoặc bị từ chối, kèm lý do.

### 7.7. Hồ sơ và uy tín

- Hồ sơ công khai tập trung vào lịch sử mua bán và phản hồi liên quan.
- Thông tin tài chính và kết quả xét điều kiện trả sau nằm trong tài khoản riêng.
- Điểm nội bộ nếu được hiển thị phải có định nghĩa, thời điểm cập nhật và cách yêu cầu xem lại thông tin sai.
- Không dùng chung cách trình bày cho sao đánh giá và điểm tín nhiệm để tránh nhầm lẫn.

## 8. Component

| Component | Quy định |
| --- | --- |
| Primary button | Nền cam đất, chữ trắng, cao tối thiểu 44px; một hành động chính trong cùng nhóm |
| Secondary button | Nền trắng, viền control, chữ than; dùng cho hành động phụ |
| Destructive action | Chữ hoặc nền đỏ theo mức độ; thao tác mất dữ liệu cần xác nhận đúng đối tượng |
| Input | Label cố định bên trên, chiều cao tối thiểu 48px; placeholder chỉ là ví dụ |
| Search | Icon tìm kiếm, ô nhập và nút xóa có tên truy cập; giữ từ khóa khi quay lại |
| Product card | Ảnh 4:3, tên tối đa 2 dòng, giá chính, tình trạng, vị trí; không bịa giá gốc hoặc phần trăm giảm |
| Trust summary | Đánh giá + số đánh giá, xác thực và giao dịch thành công hiển thị thành dữ kiện riêng |
| Payment option | Radio có nhãn, giá và số kỳ; toàn bộ vùng label có thể chọn |
| Installment schedule | Danh sách từng kỳ và tổng trả; ngày, tiền, phí và trạng thái đều đọc được |
| Badge | Nhãn ngắn, có nghĩa rõ; không dùng badge để khẳng định an toàn tuyệt đối |
| Dialog | Một mục đích, tiêu đề rõ, hành động đóng; quản lý focus và trả focus về vị trí mở |
| Toast | Thông báo phụ như “Đã lưu”; lỗi thanh toán hoặc yêu cầu xử lý nằm ngay trong màn hình |
| Empty state | Giải thích chưa có gì và một hành động phù hợp, không tạo dữ liệu lấp chỗ trống |

Button phải có đủ trạng thái default, hover, focus, pressed, disabled và loading. Loading có nhãn diễn đạt tác vụ đang chạy. Disabled có lời giải thích gần đó khi người dùng cần biết điều kiện để tiếp tục.

## 9. Dữ liệu, số tiền và trạng thái

### 9.1. Quy ước hiển thị

- Locale mặc định: tiếng Việt.
- Tiền: `900.000đ`, có thể dùng `Intl.NumberFormat('vi-VN')` và định dạng hậu tố nhất quán.
- Ngày: `19/10/2026`. Lịch thanh toán có ngày đầy đủ, không chỉ hiển thị tên tháng.
- Thời gian lịch trả và nhắc hạn hiển thị theo `Asia/Ho_Chi_Minh`; dữ liệu từ hệ thống phải có múi giờ xác định.
- Khoảng cách là ước tính và chỉ xuất hiện khi có dữ liệu vị trí; không tự tạo khoảng cách.
- Cắt gọn tên dài ở card nhưng phải đọc được đầy đủ trong trang chi tiết.

### 9.2. Tổng tiền phải khớp

- Lưu và tính tiền VND bằng số nguyên, không dùng số thực cho phép tính tiền.
- Tổng các kỳ phải bằng tổng nghĩa vụ thanh toán được hiển thị.
- Ví dụ không phí: `900.000đ = 3 × 300.000đ`.
- Ví dụ làm tròn: `1.000.000đ = 333.333đ + 333.333đ + 333.334đ`.
- Không viết `1.000.000đ = 3 × 333.000đ`.
- Khi có đối tác thật, dùng lịch trả và cách làm tròn do đối tác trả về; ví dụ trên chỉ giải thích tính nhất quán số học.
- Không mặc định phí bằng 0 khi chưa có dữ liệu. Phân biệt chưa xác định phí với được xác nhận miễn phí.

### 9.3. Trạng thái cần thiết kế trước

| Tình huống | Hành vi giao diện |
| --- | --- |
| Đang tải danh sách | Skeleton giữ đúng bố cục card, không nhấp nháy liên tục |
| Không có kết quả | Nhắc bộ lọc hiện tại, cho sửa hoặc xóa bộ lọc |
| Lỗi kết nối | Thông báo tại vùng bị lỗi, giữ dữ liệu đã nhập, có thử lại |
| Sản phẩm đã bán | Giữ trang có thể đọc, thay CTA bằng trạng thái đã bán và gợi ý khác |
| Người bán chưa có đánh giá | Hiển thị “Chưa có đánh giá”, không tạo sao mặc định |
| Trả sau chưa khả dụng | Nêu lý do nếu có; cung cấp trả thẳng khi còn áp dụng |
| Chưa biết kết quả thanh toán | Hiển thị đang kiểm tra, không vội báo thất bại hoặc cho gửi đơn trùng |
| Giao dịch hoàn tất | Có mã đơn, bước tiếp theo và đường đến chi tiết giao dịch |
| Form có lỗi | Chỉ rõ trường và cách sửa, giữ toàn bộ dữ liệu hợp lệ |

## 10. Nội dung và giọng điệu

Viết tiếng Việt tự nhiên, ngắn, tôn trọng người dùng. Mỗi nhãn mô tả hành động hoặc trạng thái cụ thể.

| Nên dùng | Tránh dùng |
| --- | --- |
| “Phù hợp ngân sách bạn đã chọn” | “AI biết chính xác món bạn cần” |
| “Đã xác thực danh tính” | “Người bán an toàn 100%” |
| “300.000đ/kỳ · 3 kỳ” cùng giá tổng | Chỉ “300.000đ” cho món giá 900.000đ |
| “Xem lịch thanh toán” | “Mua ngay, chẳng cần nghĩ” |
| “Chưa có đánh giá” | “Uy tín thấp” cho tài khoản mới |
| “Không thể tải danh sách. Thử lại” | “Có lỗi xảy ra” mà không có hướng xử lý |

Không dùng đếm ngược, số người đang xem, nhãn khan hiếm hoặc phần trăm giảm giá nếu không có dữ liệu thật hỗ trợ. Không công khai nhãn phán xét năng lực tài chính của người mua.

## 11. Khả năng truy cập và chuyển động

- Mục tiêu thiết kế: tương phản ít nhất 4.5:1 cho chữ thường, 3:1 cho chữ lớn và các dấu hiệu control cần thiết.
- Vùng bấm tối thiểu 44 × 44px. Các action nằm gần nhau có khoảng cách tránh bấm nhầm.
- Mọi luồng chính thực hiện được bằng bàn phím; luôn có focus ring rõ.
- Dùng label thật cho input; radio, checkbox và button dùng phần tử đúng ngữ nghĩa.
- Dialog giữ focus trong vùng đang mở; đóng dialog trả focus về nút mở.
- Lỗi phải có mô tả bằng chữ, liên kết tới trường tương ứng. Không chỉ tô đỏ viền.
- Toast và trạng thái bất đồng bộ được thông báo bằng live region phù hợp, tránh đọc lại cả trang.
- Ảnh sản phẩm có alt text mô tả hữu ích; ảnh trang trí không đọc lặp nội dung.
- Kiểm tra zoom 200%, nhãn dài và chiều rộng 320px.
- Chuyển động ngắn 150–200ms, phục vụ thay đổi trạng thái. Tôn trọng `prefers-reduced-motion`.

## 12. Phạm vi prototype và tích hợp thật

### Prototype ưu tiên

Thiết kế đủ các trạng thái cho luồng: **Khám phá → nhập tiêu chí gợi ý → chọn món → xem tình trạng và uy tín → chọn thanh toán → kiểm tra đơn → kết quả mô phỏng**.

Tiếp theo hoàn thiện đăng bán, theo dõi giao dịch và lịch trả sau. Ưu tiên các màn hình thể hiện khác biệt của ReOwn trước khi mở rộng tính năng phụ.

### Dữ liệu mẫu

- Gắn nhãn “Dữ liệu minh họa” tại ngữ cảnh demo.
- Bộ dữ liệu nhất quán có thể dùng: Laptop Dell Inspiron, giá 900.000đ; ví dụ 3 kỳ 300.000đ khi giả định phí 0đ.
- Người bán mẫu: đánh giá 4,8/5 từ 12 đánh giá, 12 giao dịch hoàn tất, đã xác thực danh tính. Đây là các trường độc lập dù dữ liệu ví dụ có cùng số lượng.
- Không dùng giấy tờ cá nhân thật trong prototype.
- Ảnh placeholder được ghi rõ là placeholder; thay bằng ảnh sản phẩm có quyền sử dụng trước khi ra mắt.

### Trả sau và uy tín

Tài liệu dự án chưa xác nhận đã tích hợp đối tác BNPL. Vì vậy prototype phải phân biệt rõ mô phỏng với dịch vụ đang hoạt động.

- Chưa có tích hợp: ghi rõ mô phỏng hoặc chưa khả dụng; không hiển thị tên đối tác như đã ký kết.
- Có tích hợp: lấy điều kiện, phí, lịch trả và trạng thái từ dữ liệu thật.
- Frontend chỉ trình bày kết quả, không tự đặt ngưỡng điểm hoặc tự tuyên bố duyệt trả sau.
- Không mô tả dịch vụ bảo chứng, hoàn tiền, bảo hiểm hay bảo vệ giao dịch như cam kết đang có nếu chưa được xác nhận trong chính sách sản phẩm.

## 13. Hướng dẫn cho developer và AI

1. Đọc `DESIGN.md` trước khi tạo hoặc sửa UI. Khi dự án có component hoặc token tương đương, ưu tiên tái sử dụng.
2. Giữ đúng định vị sinh viên, đồ cũ, giá minh bạch và thông tin uy tín có giải thích.
3. Dùng semantic token, không rải mã màu và spacing tùy ý trong component.
4. Không thêm dashboard chỉ số, banner quảng cáo lớn, gamification hay tính năng ngoài luồng chỉ để lấp khoảng trống.
5. Mỗi màn hình có một hành động chính rõ ràng, đủ loading, empty, error và success khi áp dụng.
6. Thiết kế responsive từ nội dung thật, gồm tên dài, mô tả lỗi và lịch trả nhiều kỳ.
7. Không tự tạo dữ kiện xác thực, phản hồi, khoảng cách, phí, quyết định duyệt hoặc cam kết sản phẩm.
8. Nếu nguồn dữ liệu chưa có, phân biệt dữ liệu minh họa với trạng thái chưa xác định.
9. Ưu tiên kiến trúc và thư viện đang có trong repo. File này không bắt buộc React, Tailwind hoặc một UI framework cụ thể.
10. Khi thay đổi quy tắc nền tảng, cập nhật file cùng với component liên quan để tránh tài liệu lệch sản phẩm.

## 14. Tiêu chí kiểm tra trước khi bàn giao UI

- [ ] Nhìn màn hình sản phẩm có thể tìm thấy giá tổng, tình trạng và thông tin người bán.
- [ ] Người dùng đọc được cơ sở của đánh giá và phân biệt với xác thực danh tính.
- [ ] Trả sau luôn thể hiện số kỳ, tiền từng kỳ, phí và tổng trả tại bước quyết định.
- [ ] Tổng các kỳ và bảng chi phí khớp nhau; không có giá hoặc phí giả định bị trình bày như đã xác nhận.
- [ ] Không đặt hàng hoặc chuyển sang trả sau chỉ vì người dùng chọn radio.
- [ ] Form giữ dữ liệu khi lỗi, có nhãn và hướng dẫn sửa lỗi rõ ràng.
- [ ] Dữ liệu tài chính của người mua không xuất hiện trên hồ sơ công khai.
- [ ] Luồng mua, đăng bán và xem giao dịch dùng được bằng bàn phím.
- [ ] Kiểm tra bố cục ở 320px, 390px, 768px, 1024px và 1440px; không có nội dung bị che hoặc cuộn ngang toàn trang.
- [ ] Kiểm tra trạng thái tài khoản mới, không có kết quả, sản phẩm đã bán và trả sau không khả dụng.
- [ ] Bản demo có nhãn minh họa; bản thật dùng dữ liệu và chính sách đã xác nhận.
- [ ] Logo, màu, font, spacing và component được dùng nhất quán.
