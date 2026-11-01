"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useMock } from "@/mocks/store";
import { ProductGrid } from "@/features/products/components/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";

export function SavedScreen() {
  const { saved, catalog, ready } = useMock();
  const products = catalog;
  if (!ready) return <LoadingScreen />;
  const items = saved
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as typeof products;

  return (
    <div className="container page">
      <nav className="small muted" aria-label="Đường dẫn">
        <Link href="/">Trang chủ</Link> / Sản phẩm đã lưu
      </nav>
      <div className="section-heading">
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "2.125rem",
              letterSpacing: "-0.01em",
            }}
          >
            Sản phẩm đã lưu
          </h1>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            {items.length} sản phẩm · được lưu trên thiết bị này
          </p>
        </div>
      </div>
      {items.length > 0 ? (
        <ProductGrid items={items} headingLevel={2} />
      ) : (
        <EmptyState icon={Heart} title="Chưa có sản phẩm nào được lưu">
          Nhấn biểu tượng trái tim trên sản phẩm để lưu lại và xem sau.
        </EmptyState>
      )}
    </div>
  );
}
