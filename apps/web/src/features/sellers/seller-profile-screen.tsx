"use client";
import { useState } from "react";
import { ShieldCheck, MapPin } from "lucide-react";
import { useMock } from "@/mocks/store";
import { ProductGrid } from "@/features/products/components/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";
const sampleReviews = [
  {
    author: "Ngọc Mai",
    stars: 5,
    text: "Mô tả đúng tình trạng, cho kiểm tra máy kỹ trước khi nhận.",
  },
  {
    author: "Hoàng Nam",
    stars: 5,
    text: "Hẹn nhận thuận tiện, món đồ giống thông tin đã đăng.",
  },
];
export function SellerProfileScreen({ name }: { name: string }) {
  const [tab, setTab] = useState("listings");
  const { catalog, orders, user, ready } = useMock();
  if (!ready) return <LoadingScreen />;
  const all = catalog.filter((p) => p.seller === name);
  const listings = all.filter((p) => !p.sold);
  const rating = all[0]?.rating ?? "Chưa có đánh giá";
  const reviews = orders
    .filter(
      (o) =>
        o.review &&
        (o.product ?? catalog.find((p) => p.id === o.productId))?.seller ===
          name,
    )
    .map((o) => ({
      author: user?.name ?? "Người mua demo",
      stars: o.review!.stars,
      text: o.review!.text,
    }));
  const visibleReviews =
    name === "Minh Anh" ? [...reviews, ...sampleReviews] : reviews;
  return (
    <div className="container page seller-page">
      <section className="panel seller-profile-header">
        <span className="seller-profile-avatar">
          {name
            .split(" ")
            .map((v) => v[0])
            .slice(-2)
            .join("")}
        </span>
        <div className="seller-profile-info">
          <h1>{name}</h1>
          <p className="small muted">Thành viên từ 03/2026 · Dữ liệu mẫu</p>
          <div className="seller-profile-facts">
            <strong>
              {rating}
              {rating !== "Chưa có đánh giá" && " · Đánh giá mẫu"}
            </strong>
            {name === "Minh Anh" && (
              <span className="verified-label">
                <ShieldCheck size={16} />
                Đã xác thực danh tính (mẫu)
              </span>
            )}
            <span>
              <MapPin size={16} />
              TP. Hồ Chí Minh
            </span>
          </div>
        </div>
        <div className="seller-profile-count">
          <b>{name === "Minh Anh" ? 12 : 0}</b>
          <span>
            Giao dịch hoàn tất
            <br />
            (minh họa)
          </span>
        </div>
      </section>
      <div className="tabs" role="group" aria-label="Trang người bán">
        <button
          aria-pressed={tab === "listings"}
          onClick={() => setTab("listings")}
        >
          Tin đang bán ({listings.length})
        </button>
        <button
          aria-pressed={tab === "reviews"}
          onClick={() => setTab("reviews")}
        >
          Đánh giá
        </button>
      </div>
      {tab === "listings" ? (
        listings.length ? (
          <ProductGrid items={listings} headingLevel={2} />
        ) : (
          <EmptyState title="Người bán chưa có tin nào">
            Quay lại sau để xem tin mới.
          </EmptyState>
        )
      ) : (
        <section className="stack" aria-label="Đánh giá người bán">
          {visibleReviews.length ? (
            visibleReviews.map((review, index) => (
              <article key={index} className="panel">
                <div className="section-heading">
                  <strong>{review.author}</strong>
                  <span className="small muted">Đánh giá minh họa</span>
                </div>
                <p
                  className="review-score"
                  aria-label={`${review.stars} trên 5 sao`}
                >
                  {"★".repeat(review.stars)}
                  {"☆".repeat(5 - review.stars)}
                </p>
                <p>{review.text || "Người mua không để lại nhận xét."}</p>
              </article>
            ))
          ) : (
            <EmptyState title="Chưa có nhận xét">
              Các đánh giá sau giao dịch sẽ xuất hiện tại đây.
            </EmptyState>
          )}
        </section>
      )}
    </div>
  );
}
