"use client";

import Image from "next/image";

import { money, type OrderStatus, type Product } from "@/mocks/data";

export function ProductLine({ product }: { product: Product }) {
  return (
    <div className="purchase-product">
      <Image src={product.image} alt="" width={112} height={100} />
      <div>
        <strong>{product.name}</strong>
        <span>Người bán: {product.seller}</span>
        <span>{product.condition} · Số lượng: 1</span>
        <b>{money(product.price)}</b>
      </div>
    </div>
  );
}
export function PriceLines({ price, total }: { price: number; total: number }) {
  return (
    <dl className="purchase-prices">
      <div>
        <dt>Giá sản phẩm</dt>
        <dd>{money(price)}</dd>
      </div>
      <div>
        <dt>Phí giao nhận (minh họa)</dt>
        <dd>{money(total - price)}</dd>
      </div>
      <div>
        <dt>Phí nền tảng (demo)</dt>
        <dd>0₫</dd>
      </div>
    </dl>
  );
}
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`badge ${status === "Hoàn tất" ? "success" : status === "Đã hủy" ? "danger" : status === "Chờ thanh toán" ? "neutral" : ""}`}
    >
      {status}
    </span>
  );
}
