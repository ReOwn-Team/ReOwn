import { MapPin, Truck } from "lucide-react";
import type { Product } from "@/mocks/data";

export function ProductFulfillment({ product }: { product: Product }) {
  const delivery = product.deliveryModes ?? ["meetup", "shipping"];
  return (
    <section
      className="product-fulfillment"
      id="giao-nhan"
      aria-labelledby="product-delivery-title"
      tabIndex={-1}
    >
      <h2 id="product-delivery-title">Cách nhận sản phẩm</h2>
      <div className="product-fulfillment-options">
        {delivery.includes("meetup") && (
          <div className="product-fulfillment-method">
            <MapPin aria-hidden="true" />
            <div>
              <h3>Gặp trực tiếp</h3>
              <p>{product.location}</p>
              <small>Hẹn địa điểm và kiểm tra khi nhận.</small>
            </div>
          </div>
        )}
        {delivery.includes("shipping") && (
          <div className="product-fulfillment-method">
            <Truck aria-hidden="true" />
            <div>
              <h3>Giao hàng</h3>
              <p>Thống nhất phí giao hàng với người bán.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
