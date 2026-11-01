import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  MessageCircle,
  Package,
  ShieldQuestion,
  Star,
  Store,
  Truck,
} from "lucide-react";
import type { Product } from "@/mocks/data";

export function ProductSeller({
  product,
  listingCount,
}: {
  product: Product;
  listingCount: number | null;
}) {
  const initials =
    product.seller
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(-2)
      .join("") || "R";
  const hasRating = /^\d([,.]\d)?/.test(product.rating);
  const delivery = product.deliveryModes ?? ["meetup", "shipping"];
  const receiving = [
    delivery.includes("meetup") && "Gặp trực tiếp",
    delivery.includes("shipping") && "Giao hàng",
  ].filter(Boolean).join(" · ");

  return (
    <aside className="product-seller" id="nguoi-ban" aria-labelledby="product-seller-title" tabIndex={-1}>
      <div className="product-seller-header">
        <span className="seller-avatar" aria-hidden="true">{initials}</span>
        <div className="product-seller-name">
          <h2 id="product-seller-title">{product.seller}</h2>
          <p>Người bán trên ReOwn</p>
        </div>
        {!product.live && (
          <Link className="product-seller-shop" href={`/sellers/${encodeURIComponent(product.seller)}`}>
            <Store aria-hidden="true" /> Xem shop
          </Link>
        )}
      </div>
      <button className="product-seller-chat" type="button" disabled>
        <MessageCircle aria-hidden="true" /> Chat với người bán <small>Sắp có</small>
      </button>
      <dl className="product-seller-stats">
        <div>
          <dt><ShieldQuestion aria-hidden="true" /> Uy tín</dt>
          <dd>Chưa xếp hạng</dd>
        </div>
        <div>
          <dt><Star aria-hidden="true" /> Đánh giá</dt>
          <dd>{hasRating ? product.rating : "Chưa có đánh giá"}</dd>
        </div>
        <div>
          <dt><Package aria-hidden="true" /> Đang bán</dt>
          <dd>{listingCount === null ? "Chưa có dữ liệu" : `${listingCount} món`}</dd>
        </div>
        <div>
          <dt><MapPin aria-hidden="true" /> Khu vực</dt>
          <dd>{product.location}</dd>
        </div>
        <div className="product-seller-stats-wide">
          <dt><Truck aria-hidden="true" /> Cách nhận</dt>
          <dd>{receiving || "Chưa xác định"}</dd>
        </div>
      </dl>
      {!product.live && <p className="product-seller-demo">Đánh giá và số tin là dữ liệu minh họa.</p>}
      <details className="product-seller-details">
        <summary>Về thông tin người bán <ChevronDown aria-hidden="true" /></summary>
        <p>Hạng uy tín và thời gian nhận tiền chưa có dữ liệu xác thực. Kiểm tra sản phẩm khi nhận và chỉ giao dịch trong ReOwn.</p>
        <Link href="/help?topic=safety">Xem hướng dẫn mua an toàn <ArrowRight aria-hidden="true" /></Link>
      </details>
    </aside>
  );
}
