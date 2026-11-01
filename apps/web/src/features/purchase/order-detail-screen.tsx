"use client";

import { useState } from "react";
import Link from "next/link";

import { useSearchParams } from "next/navigation";
import { Check, Clock3 } from "lucide-react";
import { money, type OrderStatus } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { Dialog } from "@/components/ui/dialog";
import { DemoNote } from "@/components/ui/demo-note";
import { EmptyState } from "@/components/ui/empty-state";

import { PaymentPlan } from "@/features/purchase/components/payment-plan";
import { deliveryName } from "@/features/purchase/order-format";
import { paymentName } from "@/features/purchase/order-format";
import { ProductLine } from "@/features/purchase/components/order-summary";
import { PriceLines } from "@/features/purchase/components/order-summary";
import { StatusBadge } from "@/features/purchase/components/order-summary";
import { AddressLines } from "@/features/addresses/components/address-lines";
import { ReviewDialog } from "@/features/purchase/components/review-dialog";
export function OrderDetailScreen({ id }: { id: string }) {
  return (
    <AuthGate title="Đăng nhập để xem đơn hàng">
      <OrderDetail id={id} />
    </AuthGate>
  );
}
function OrderDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const store = useMock();
  const order = store.orders.find((o) => o.id === id);
  const [payment, setPayment] = useState(false);
  const [failure, setFailure] = useState("");
  const [cancel, setCancel] = useState(false);
  const [review, setReview] = useState(false);
  if (!order)
    return (
      <div className="container page">
        <EmptyState title="Không tìm thấy đơn hàng">
          Đơn có thể đã được xóa khi đặt lại demo.
        </EmptyState>
      </div>
    );
  const product =
    order.product ?? store.catalog.find((p) => p.id === order.productId);
  if (!product) return null;
  function transition(status: OrderStatus) {
    store.setOrders((current) =>
      current.map((o) =>
        o.id === id
          ? { ...o, status, paid: o.paid || status === "Chờ xác nhận" }
          : o,
      ),
    );
    store.setSales((current) => {
      const exists = current.some((s) => s.id === id);
      if (status === "Chờ xác nhận" && !exists)
        return [{ ...order!, product, status, paid: true }, ...current];
      return current.map((s) => (s.id === id ? { ...s, status } : s));
    });
    if (status === "Hoàn tất")
      store.setListings((current) =>
        current.map((l) =>
          l.id === order!.productId ? { ...l, status: "Đã bán" } : l,
        ),
      );
    setPayment(false);
    setCancel(false);
    store.notify(`Đơn hàng: ${status.toLocaleLowerCase("vi")}.`);
  }
  const created =
    params.get("created") === "1" && order.status === "Chờ thanh toán";
  const steps: OrderStatus[] = [
    "Chờ thanh toán",
    "Chờ xác nhận",
    "Chuẩn bị hàng",
    "Đang giao",
    "Hoàn tất",
  ];
  const active = steps.indexOf(order.status);
  return (
    <div className="container page purchase-page">
      {created ? (
        <section className="purchase-card order-created">
          <Clock3 size={32} aria-hidden="true" />
          <span className="small muted">MÃ ĐƠN · {id}</span>
          <h1>Đơn đã được tạo. Chỉ còn bước thanh toán.</h1>
          <p className="muted">
            Thông tin nhận hàng đã được ghi nhận. Hoàn tất thanh toán để người
            bán tiếp tục xử lý đơn.
          </p>
          <p>Chờ thanh toán · Bạn chưa bị trừ tiền</p>
          <div className="action-row">
            <button className="button primary" onClick={() => setPayment(true)}>
              Quay lại bước thanh toán
            </button>
            <Link className="button secondary" href="/browse">
              Tiếp tục khám phá
            </Link>
            <Link className="button secondary" href={`/orders/${id}`}>
              Theo dõi đơn hàng
            </Link>
          </div>
        </section>
      ) : (
        <>
          <Link className="purchase-back" href="/orders">
            ‹ Đơn hàng của tôi
          </Link>
          <div className="section-heading">
            <div>
              <h1>Đơn hàng {id}</h1>
              <p className="small muted">
                1 sản phẩm · {paymentName(order.months)} ·{" "}
                {deliveryName(order.delivery)}
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>
          <section className="purchase-card">
            <h2>Tiến trình đơn hàng</h2>
            {order.status === "Đã hủy" ? (
              <p>Đơn đã hủy. Không tiếp tục thanh toán hoặc giao nhận.</p>
            ) : (
              <ol className="tracking-steps">
                {steps.map((step, index) => (
                  <li
                    key={step}
                    className={index <= active ? "done" : ""}
                    aria-current={index === active ? "step" : undefined}
                  >
                    <span className="step-number">
                      {index < active ? (
                        <Check size={14} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <strong>{step}</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      <div className="two-column">
        <div className="stack">
          <section className="purchase-card">
            <h2>Sản phẩm trong đơn</h2>
            <ProductLine product={product} />
            <Link className="button secondary" href={`/products/${product.id}`}>
              Xem sản phẩm
            </Link>
          </section>
          <section className="purchase-card">
            <h2>Thông tin nhận hàng</h2>
            <AddressLines address={order.address} />
            <p className="purchase-help">{deliveryName(order.delivery)}</p>
            <p className="small">Ghi chú: {order.note || "Không có"}</p>
          </section>
          <section className="purchase-card">
            <h2>Cập nhật đơn hàng</h2>
            <strong>
              {order.status === "Chờ thanh toán"
                ? "Đơn đang chờ thanh toán"
                : `Đơn hàng ${order.status.toLocaleLowerCase("vi")}`}
            </strong>
            <p className="purchase-help">
              {order.status === "Chờ thanh toán"
                ? "Thông tin đơn đã được tạo. Chưa ghi nhận giao dịch thanh toán thành công."
                : "Trạng thái minh họa được cập nhật xuyên suốt luồng mua và bán."}
            </p>
            {order.createdAt && (
              <time className="small muted" dateTime={order.createdAt}>
                {new Date(order.createdAt).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
              </time>
            )}
          </section>
        </div>
        <div className="stack">
          <section className="purchase-card">
            <h2>Thông tin thanh toán</h2>
            <PriceLines price={product.price} total={order.total} />
            <div className="purchase-total">
              <strong>
                {order.paid ? "Tổng thanh toán" : "Cần thanh toán"}
              </strong>
              <b>{money(order.total)}</b>
            </div>
            {order.status === "Chờ thanh toán" && (
              <button
                className="button primary full"
                onClick={() => setPayment(true)}
              >
                Quay lại thanh toán
              </button>
            )}
            {order.status === "Đang giao" && (
              <button
                className="button primary full"
                onClick={() => transition("Hoàn tất")}
              >
                Xác nhận đã nhận hàng
              </button>
            )}
            {order.status === "Hoàn tất" && (
              <button
                className="button primary full"
                disabled={!!order.review}
                onClick={() => setReview(true)}
              >
                {order.review ? "Đã đánh giá" : "Đánh giá giao dịch"}
              </button>
            )}
            {["Chờ thanh toán", "Chờ xác nhận"].includes(order.status) && (
              <button className="plain-button" onClick={() => setCancel(true)}>
                Hủy đơn hàng
              </button>
            )}
            <p className="purchase-help">
              {order.paid
                ? "Thanh toán mô phỏng đã được ghi nhận. Không có khoản tiền thật bị trừ."
                : "Bạn chưa bị trừ tiền. Trạng thái sẽ cập nhật khi mô phỏng thành công."}
            </p>
          </section>
          {order.months > 1 && (
            <section className="purchase-card">
              <PaymentPlan
                total={order.total}
                months={order.months}
                start={order.createdAt}
              />
            </section>
          )}
          <section className="purchase-card">
            <h2>Người bán</h2>
            <div className="seller-identity">
              <span className="seller-avatar">{product.seller.charAt(0)}</span>
              <div>
                <strong>{product.seller}</strong>
                <p className="small muted">{product.rating}</p>
              </div>
            </div>
            <Link
              className="text-link"
              href={`/sellers/${encodeURIComponent(product.seller)}`}
            >
              Xem hồ sơ &amp; đánh giá →
            </Link>
          </section>
        </div>
      </div>
      {payment && (
        <Dialog title="Thanh toán minh họa" onClose={() => setPayment(false)}>
          <div className="stack">
            <h2>Thanh toán đơn hàng</h2>
            <p>
              Tổng thanh toán: <strong>{money(order.total)}</strong>
            </p>
            <DemoNote>
              Đây là mô phỏng. Không chuyển tiền hoặc nhập thông tin thanh toán
              thật.
            </DemoNote>
            {failure && (
              <p className="error" role="alert">
                {failure}
              </p>
            )}
            <button
              className="button primary"
              onClick={() => transition("Chờ xác nhận")}
            >
              Mô phỏng thanh toán thành công
            </button>
            <button
              className="button secondary"
              onClick={() =>
                setFailure(
                  "Chưa thanh toán thành công. Đơn được giữ nguyên; bạn có thể thử lại.",
                )
              }
            >
              Mô phỏng thanh toán thất bại
            </button>
          </div>
        </Dialog>
      )}
      {cancel && (
        <Dialog title="Hủy đơn hàng" onClose={() => setCancel(false)}>
          <div className="stack">
            <h2>Hủy đơn {id}?</h2>
            <p>
              {order.paid
                ? "Demo sẽ chuyển đơn sang đã hủy. Không có giao dịch hoàn tiền thật."
                : "Đơn sẽ ngừng xử lý và không phát sinh thanh toán."}
            </p>
            <button
              className="button danger"
              onClick={() => transition("Đã hủy")}
            >
              Xác nhận hủy đơn
            </button>
            <button
              className="button secondary"
              onClick={() => setCancel(false)}
            >
              Giữ đơn hàng
            </button>
          </div>
        </Dialog>
      )}
      {review && (
        <ReviewDialog order={order} onClose={() => setReview(false)} />
      )}
    </div>
  );
}
