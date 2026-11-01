import { Info } from "lucide-react";
import type { Product } from "@/mocks/data";

export function ProductInformation({ product }: { product: Product }) {
  const isDemoLaptop = !product.live && product.id === "laptop";

  return (
    <section
      className="product-panel product-information"
      id="mo-ta"
      aria-labelledby="product-description-title"
      tabIndex={-1}
    >
      <h2 id="product-description-title">Thông tin sản phẩm</h2>
      <div className="product-information-main">
        <dl className="product-facts">
          <div><dt>Danh mục</dt><dd>{product.category}</dd></div>
          <div><dt>Khu vực bán</dt><dd>{product.location}</dd></div>
          {isDemoLaptop && <div><dt>Đi kèm</dt><dd>Máy và sạc</dd></div>}
        </dl>
        <div className="product-description-copy">
          <h3>Mô tả từ người bán</h3>
          <p>{product.description.trim() || "Người bán chưa thêm mô tả."}</p>
        </div>
        <section
          className="product-condition-note"
          id="tinh-trang"
          aria-labelledby="product-defects-title"
          tabIndex={-1}
        >
          <Info aria-hidden="true" />
          <div>
            <h3 id="product-defects-title">Tình trạng cần lưu ý</h3>
            <p>{product.defects.trim() || "Người bán chưa bổ sung thông tin về các điểm cần lưu ý."}</p>
            <small>Thông tin do người bán cung cấp. Hãy kiểm tra lại khi nhận sản phẩm.</small>
          </div>
        </section>
      </div>
    </section>
  );
}
