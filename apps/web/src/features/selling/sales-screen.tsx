"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

import { money, type OrderStatus } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { Dialog } from "@/components/ui/dialog";
import { DemoNote } from "@/components/ui/demo-note";
import { EmptyState } from "@/components/ui/empty-state";
import {
    ProductLine,
    StatusBadge,
} from "@/features/purchase/components/order-summary";
import { AddressLines } from "@/features/addresses/components/address-lines";

export function SalesScreen() {
    return (
        <AuthGate loadingVariant="list" title="Đăng nhập để xem đơn bán">
            <SalesContent />
        </AuthGate>
    );
}
function SalesContent() {
    const store = useMock();
    const [selected, setSelected] = useState<string | null>(null);
    const [action, setAction] = useState<"accept" | "reject" | null>(null);
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");
    const sale = store.sales.find((s) => s.id === selected) ?? store.sales[0];
    function transition(status: OrderStatus) {
        if (!sale) return;
        store.setSales((current) =>
            current.map((s) =>
                s.id === sale.id ? { ...s, status, rejection: reason } : s,
            ),
        );
        store.setOrders((current) =>
            current.map((s) =>
                s.id === sale.id ? { ...s, status, rejection: reason } : s,
            ),
        );
        if (status === "Hoàn tất")
            store.setListings((current) =>
                current.map((l) =>
                    l.id === sale.productId ? { ...l, status: "Đã bán" } : l,
                ),
            );
        setAction(null);
        store.notify(`Đơn bán: ${status.toLocaleLowerCase("vi")}.`);
    }
    const product =
        sale?.product ?? store.catalog.find((p) => p.id === sale?.productId);
    return (
        <div className="container page sales-page">
            <p className="muted">
                Phản hồi đơn mới và theo dõi những món đồ bạn đang gửi đi.
            </p>
            <div className="action-row">
                <Link className="button secondary" href="/listings">
                    Quản lý tin đăng
                </Link>
                <span className="button current-section">Đơn bán</span>
            </div>
            <div className="sales-stats">
                {["Chờ xác nhận", "Chuẩn bị hàng", "Đang giao"].map((value) => (
                    <div className="panel" key={value}>
                        <b>
                            {
                                store.sales.filter((s) => s.status === value)
                                    .length
                            }
                        </b>
                        <span>
                            {value === "Chờ xác nhận" ? "Cần xác nhận" : value}
                        </span>
                    </div>
                ))}
            </div>
            {store.sales.length > 1 && (
                <div className="tabs" role="group" aria-label="Chọn đơn bán">
                    {store.sales.map((s) => (
                        <button
                            key={s.id}
                            aria-pressed={s.id === sale?.id}
                            onClick={() => setSelected(s.id)}
                        >
                            {s.id}
                        </button>
                    ))}
                </div>
            )}
            {sale && product ? (
                <>
                    <section className="panel">
                        <div className="section-heading">
                            <h2>{sale.id} · Đơn bán</h2>
                            <StatusBadge status={sale.status} />
                        </div>
                        <p className="small muted">
                            Kiểm tra sản phẩm còn sẵn và thông tin nhận hàng
                            trước khi xác nhận đơn.
                        </p>
                    </section>
                    <div className="two-column">
                        <div className="stack">
                            <section className="panel stack">
                                <h2>Sản phẩm trong đơn</h2>
                                <ProductLine product={product} />
                                <p className="small muted">
                                    Đã mô tả: {product.defects}
                                </p>
                            </section>
                            <section className="panel stack">
                                <h2>Người mua &amp; giao nhận</h2>
                                <AddressLines address={sale.address} />
                                <p>
                                    {sale.delivery === "shipping"
                                        ? "Giao hàng đến địa chỉ người mua"
                                        : "Gặp trực tiếp"}
                                </p>
                                <p className="small muted">
                                    Ghi chú từ người mua
                                </p>
                                <p>{sale.note || "Không có ghi chú."}</p>
                            </section>
                            <section className="panel stack">
                                <h2>Cập nhật đơn hàng</h2>
                                <strong>{sale.status}</strong>
                                <p className="small muted">
                                    {sale.rejection ||
                                        "Trạng thái được đồng bộ với đơn mua trong bản demo."}
                                </p>
                            </section>
                        </div>
                        <div className="stack">
                            <section className="panel stack">
                                <h2>Phản hồi đơn hàng</h2>
                                {sale.status === "Chờ xác nhận" ? (
                                    <>
                                        <p className="small muted">
                                            Xác nhận khi bạn còn sản phẩm và có
                                            thể giao đúng tình trạng đã đăng.
                                        </p>
                                        <button
                                            className="button primary"
                                            onClick={() => setAction("accept")}
                                        >
                                            Xác nhận đơn
                                        </button>
                                        <button
                                            className="button secondary"
                                            onClick={() => {
                                                setReason("");
                                                setError("");
                                                setAction("reject");
                                            }}
                                        >
                                            Từ chối đơn
                                        </button>
                                    </>
                                ) : sale.status === "Chuẩn bị hàng" ? (
                                    <button
                                        className="button primary"
                                        onClick={() => transition("Đang giao")}
                                    >
                                        {sale.delivery === "shipping"
                                            ? "Đã bàn giao vận chuyển"
                                            : "Bắt đầu giao nhận"}
                                    </button>
                                ) : sale.status === "Đang giao" ? (
                                    <p className="muted">
                                        Chờ người mua kiểm tra và xác nhận đã
                                        nhận hàng.
                                    </p>
                                ) : (
                                    <p className="muted">
                                        Đơn hàng{" "}
                                        {sale.status.toLocaleLowerCase("vi")}.
                                    </p>
                                )}
                            </section>
                            <section className="panel stack">
                                <h2>Thông tin thanh toán</h2>
                                <span className="small muted">
                                    Giá sản phẩm
                                </span>
                                <strong className="sale-price">
                                    {money(product.price)}
                                </strong>
                                <span className="small muted">
                                    Phí giao hàng minh họa:{" "}
                                    {money(sale.total - product.price)}
                                </span>
                                <DemoNote>
                                    {sale.months === 1
                                        ? "Thanh toán một lần"
                                        : `Thanh toán trong ${sale.months} tháng`}
                                    . Đơn mô phỏng, không phát sinh khoản vay
                                    hoặc giao dịch tiền thật.
                                </DemoNote>
                            </section>
                        </div>
                    </div>
                </>
            ) : (
                <EmptyState title="Bạn chưa có đơn bán">
                    Các đơn mới sẽ xuất hiện tại đây.
                </EmptyState>
            )}
            {action && (
                <Dialog
                    title={
                        action === "accept"
                            ? "Xác nhận đơn bán"
                            : "Từ chối đơn bán"
                    }
                    onClose={() => setAction(null)}
                >
                    <form
                        className="stack"
                        onSubmit={(e: FormEvent) => {
                            e.preventDefault();
                            if (action === "reject" && !reason.trim()) {
                                setError(
                                    "Nhập lý do từ chối để người mua biết.",
                                );
                                return;
                            }
                            transition(
                                action === "accept"
                                    ? "Chuẩn bị hàng"
                                    : "Đã hủy",
                            );
                        }}
                    >
                        <h2>
                            {action === "accept"
                                ? "Sẵn sàng chuẩn bị món đồ?"
                                : "Vì sao bạn từ chối đơn?"}
                        </h2>
                        {action === "reject" ? (
                            <div className="field">
                                <label htmlFor="reject-reason">
                                    Lý do từ chối
                                </label>
                                <textarea
                                    id="reject-reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    aria-invalid={!!error}
                                    aria-describedby={
                                        error ? "reject-error" : undefined
                                    }
                                />
                                {error && (
                                    <p
                                        className="error"
                                        id="reject-error"
                                        role="alert"
                                    >
                                        {error}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p>
                                Đơn chuyển sang Chuẩn bị hàng. Hãy kiểm tra sản
                                phẩm trước khi bàn giao.
                            </p>
                        )}
                        <button
                            className={`button ${action === "accept" ? "primary" : "danger"}`}
                        >
                            {action === "accept"
                                ? "Xác nhận đơn"
                                : "Từ chối đơn"}
                        </button>
                        <button
                            className="button secondary"
                            type="button"
                            onClick={() => setAction(null)}
                        >
                            Quay lại
                        </button>
                    </form>
                </Dialog>
            )}
        </div>
    );
}
