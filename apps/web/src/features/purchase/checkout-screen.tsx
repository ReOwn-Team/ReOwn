"use client";
import { realProductId } from "@/lib/products/client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";

import { money, type Address, type MockOrder } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { Dialog } from "@/components/ui/dialog";
import { DemoNote } from "@/components/ui/demo-note";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { EmptyState } from "@/components/ui/empty-state";
import { AddressEditor } from "@/features/addresses/components/address-editor";
import { PaymentPlan } from "@/features/purchase/components/payment-plan";
import { fee } from "@/features/purchase/order-format";
import { deliveryName } from "@/features/purchase/order-format";
import { ProductLine } from "@/features/purchase/components/order-summary";
import { PriceLines } from "@/features/purchase/components/order-summary";
import { AddressLines } from "@/features/addresses/components/address-lines";
const terms = [3, 6, 9, 12];
export function CheckoutScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const store = useMock();
  const product = store.catalog.find((p) => p.id === params.get("product"));
  const requested = Number(params.get("months"));
  const [months, setMonths] = useState(
    terms.includes(requested) ? requested : 1,
  );
  const [requestedDelivery, setDelivery] =
    useState<MockOrder["delivery"]>("shipping");
  const deliveryModes = product?.deliveryModes ?? ["shipping", "meetup"];
  const delivery: MockOrder["delivery"] = deliveryModes.includes(
    requestedDelivery,
  )
    ? requestedDelivery
    : (deliveryModes[0] as MockOrder["delivery"]);
  const [recipient, setRecipient] = useState<Address | null>(null);
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [temporary, setTemporary] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const selected =
    recipient ?? store.addresses.find((a) => a.isDefault) ?? store.addresses[0];
  if (realProductId(params.get("product") ?? ""))
    return (
      <div className="container page">
        <EmptyState title="Chưa hỗ trợ đặt hàng cho sản phẩm này">
          Tin đăng đã được lưu trên hệ thống. Tính năng đặt hàng sẽ được bổ sung
          sau.
        </EmptyState>
        <Link
          href={`/products/${params.get("product")}`}
          className="button secondary"
        >
          Quay lại sản phẩm
        </Link>
      </div>
    );
  if (!store.ready) return <LoadingScreen />;
  if (!product)
    return (
      <div className="container page">
        <EmptyState title="Chưa chọn sản phẩm">
          Chọn món đồ bạn muốn mua trước khi kiểm tra đơn hàng.
        </EmptyState>
      </div>
    );
  const total = product.price + fee(delivery);
  function createOrder() {
    if (submitted.current || !product || !selected) return;
    const existing = store.orders.find(
      (o) =>
        o.productId === product.id &&
        !["Hoàn tất", "Đã hủy"].includes(o.status),
    );
    if (existing) {
      store.notify("Sản phẩm đã có đơn đang xử lý. Đã mở đơn hiện tại.");
      router.push(`/orders/${existing.id}`);
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    const order: MockOrder = {
      id: `RO-DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      productId: product.id,
      product: { ...product },
      status: "Chờ thanh toán",
      months,
      delivery,
      total,
      address: { ...selected },
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    store.setOrders((current) => [order, ...current]);
    store.notify(
      "Đã tạo đơn minh họa. Chưa có khoản thanh toán nào được thực hiện.",
    );
    router.push(`/orders/${order.id}?created=1`);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (product?.sold) {
      setError("Sản phẩm đã bán. Hãy chọn món khác.");
      return;
    }
    if (
      !selected ||
      !selected.name.trim() ||
      !selected.phone.trim() ||
      !selected.detail.trim()
    ) {
      setError("Vui lòng nhập đủ thông tin người nhận.");
      setEditing("new");
      return;
    }
    store.requireAuth(createOrder);
  }
  return (
    <div className="container page purchase-page purchase-checkout">
      <div className="purchase-heading">
        <Link className="purchase-back" href={`/products/${product.id}`}>
          ‹ Quay lại sản phẩm
        </Link>
        <h1>Kiểm tra đơn hàng</h1>
        <ol className="purchase-checkout-progress" aria-label="Bước 2 trong 3">
          <li>✓ Chọn sản phẩm</li>
          <li aria-current="step">02 Kiểm tra &amp; thanh toán</li>
          <li>03 Hoàn tất</li>
        </ol>
      </div>
      <form className="purchase-checkout-grid" onSubmit={submit} noValidate>
        <div className="purchase-form-sections">
          <section className="purchase-card">
            <div className="purchase-card-heading">
              <h2>1. Thông tin người nhận</h2>
              <button
                className="plain-button"
                type="button"
                onClick={() => setPicker(true)}
              >
                Thay đổi
              </button>
            </div>
            <div className="purchase-info">
              <span className="purchase-caption">Thông tin đã chọn</span>
              {selected ? (
                <AddressLines address={selected} />
              ) : (
                <p>Chưa có thông tin người nhận.</p>
              )}
            </div>
            <p className="purchase-help">
              Thông tin đã lưu được điền sẵn. Bạn có thể thay đổi cho đơn này.
            </p>
          </section>
          <section className="purchase-card">
            <h2>2. Bạn muốn nhận sản phẩm thế nào?</h2>
            <div
              className="purchase-options"
              role="radiogroup"
              aria-label="Cách nhận sản phẩm"
            >
              {(["meetup", "shipping"] as const)
                .filter((value) => deliveryModes.includes(value))
                .map((value) => (
                  <label
                    className={`choice ${delivery === value ? "selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="delivery"
                      checked={delivery === value}
                      onChange={() => setDelivery(value)}
                    />
                    <span>
                      <strong>{deliveryName(value)}</strong>
                      <small>
                        {value === "meetup"
                          ? "Kiểm tra món đồ khi nhận"
                          : "Nhận tại địa chỉ của bạn"}
                      </small>
                    </span>
                  </label>
                ))}
            </div>
            <p className="purchase-help">
              {delivery === "shipping"
                ? "Giao đến địa chỉ ở phần Thông tin người nhận. Phí minh họa: 30.000₫."
                : "Thống nhất địa điểm gặp với người bán. Không tính phí giao nhận trong demo."}
            </p>
            <div className="field">
              <label htmlFor="purchase-note">
                Ghi chú cho người bán (không bắt buộc)
              </label>
              <textarea
                id="purchase-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Vui lòng liên hệ trước khi giao hàng."
              />
            </div>
          </section>
          <section className="purchase-card">
            <h2>3. Chọn cách thanh toán</h2>
            <div
              className="purchase-options"
              role="radiogroup"
              aria-label="Cách thanh toán"
            >
              <label className={`choice ${months === 1 ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="payment"
                  checked={months === 1}
                  onChange={() => setMonths(1)}
                />
                <span>
                  <strong>Trả thẳng</strong>
                  <small>Thanh toán một lần</small>
                </span>
              </label>
              <label className={`choice ${months > 1 ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="payment"
                  checked={months > 1}
                  onChange={() => setMonths(3)}
                />
                <span>
                  <strong>Chia theo tháng</strong>
                  <small>Từ 3 đến 12 tháng</small>
                </span>
              </label>
            </div>
            {months > 1 && (
              <>
                <div
                  className="chip-row"
                  role="group"
                  aria-label="Kỳ hạn thanh toán"
                >
                  {terms.map((term) => (
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={months === term}
                      key={term}
                      onClick={() => setMonths(term)}
                    >
                      {term} tháng
                    </button>
                  ))}
                </div>
                <PaymentPlan total={total} months={months} />
              </>
            )}
            <DemoNote>
              {months === 1
                ? "Thanh toán trực tuyến là mô phỏng. Không nhập thông tin thẻ hoặc chuyển tiền thật."
                : "Chia kỳ chỉ là mô phỏng, không có khoản vay hoặc xét duyệt thật."}
            </DemoNote>
          </section>
        </div>
        <aside className="purchase-card purchase-summary">
          <div className="purchase-card-heading">
            <h2>Đơn hàng của bạn</h2>
            <span className="small muted">1 sản phẩm</span>
          </div>
          <ProductLine product={product} />
          <PriceLines price={product.price} total={total} />
          <div className="purchase-total">
            <strong>Tổng thanh toán</strong>
            <b>{money(total)}</b>
          </div>
          <p className="purchase-help">
            Bằng việc xác nhận, bạn đồng ý với{" "}
            <Link href="/help?topic=terms">Điều khoản sử dụng</Link> và chính
            sách giao dịch của ReOwn.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {product.sold && (
            <p className="error">Sản phẩm đã bán. Hãy chọn món khác.</p>
          )}
          <div className="checkout-action">
            <div className="checkout-mobile-total">
              <span>Tổng thanh toán</span>
              <strong>{money(total)}</strong>
            </div>
            <button
              className="button primary full"
              disabled={submitting || product.sold}
              type="submit"
              aria-label={
                submitting ? "Đang tạo đơn…" : "Xác nhận và thanh toán"
              }
            >
              {submitting ? "Đang tạo đơn…" : "Xác nhận và thanh toán"}
            </button>
          </div>
          <p className="purchase-help">
            Bạn sẽ kiểm tra lại đơn trước khi mô phỏng thanh toán.
          </p>
        </aside>
      </form>
      {picker && !editing && (
        <Dialog title="Chọn người nhận" onClose={() => setPicker(false)}>
          <div className="stack">
            <h2>Chọn người nhận</h2>
            <p className="muted small">
              Chọn thông tin giao nhận cho đơn hàng này.
            </p>
            {store.addresses.map((address) => (
              <div key={address.id} className="recipient-choice">
                <label
                  className={`choice ${selected?.id === address.id ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="recipient"
                    checked={selected?.id === address.id}
                    onChange={() => setRecipient(address)}
                  />
                  <AddressLines address={address} />
                </label>
                <button
                  className="plain-button"
                  onClick={() => {
                    setTemporary(false);
                    setEditing(address);
                  }}
                >
                  Sửa
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              onClick={() => {
                setTemporary(false);
                setEditing("new");
              }}
            >
              Thêm người nhận
            </button>
            <button
              className="plain-button"
              onClick={() => {
                setTemporary(true);
                setEditing("new");
              }}
            >
              Chỉ dùng thông tin mới cho đơn này
            </button>
            <button className="button primary" onClick={() => setPicker(false)}>
              Dùng thông tin này
            </button>
          </div>
        </Dialog>
      )}
      {editing && (
        <AddressEditor
          initial={editing === "new" ? undefined : editing}
          temporary={temporary}
          onClose={() => setEditing(null)}
          onSave={(address) => {
            setRecipient(address);
            setEditing(null);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}
