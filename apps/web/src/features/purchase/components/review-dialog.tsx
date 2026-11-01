"use client";

import { useState } from "react";

import { Star } from "lucide-react";
import { type MockOrder } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { Dialog } from "@/components/ui/dialog";

import { ProductLine } from "@/features/purchase/components/order-summary";
export function ReviewDialog({
  order,
  onClose,
}: {
  order: MockOrder;
  onClose: () => void;
}) {
  const { catalog, setOrders, notify } = useMock();
  const product =
    order.product ?? catalog.find((p) => p.id === order.productId)!;
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  return (
    <Dialog title="Đánh giá giao dịch" onClose={onClose}>
      <form
        className="stack review-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stars) return;
          setOrders((current) =>
            current.map((o) =>
              o.id === order.id && !o.review
                ? { ...o, review: { stars, text: text.trim() } }
                : o,
            ),
          );
          notify("Đã gửi đánh giá minh họa.");
          onClose();
        }}
      >
        <p className="eyebrow">Giao dịch đã hoàn tất</p>
        <h2>Giao dịch này thế nào?</h2>
        <div className="purchase-info">
          <ProductLine product={product} />
        </div>
        <fieldset className="field">
          <legend>Bạn đánh giá người bán bao nhiêu sao?</legend>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={stars === value}
                  onChange={() => setStars(value)}
                  aria-label={`${value} sao`}
                />
                <Star
                  size={30}
                  fill={value <= stars ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="review-text">Nhận xét của bạn</label>
          <textarea
            id="review-text"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Điều gì khiến bạn hài lòng hoặc cần cải thiện?"
          />
          <span className="small muted">{text.length}/500</span>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => setText("Món đồ đúng mô tả, giao nhận thuận tiện.")}
        >
          Thêm nhận xét gợi ý
        </button>
        <p className="small muted">
          Nhận xét hiển thị cùng tên của bạn. Không chia sẻ số điện thoại hoặc
          địa chỉ.
        </p>
        <button className="button primary" disabled={!stars}>
          Gửi đánh giá
        </button>
      </form>
    </Dialog>
  );
}
