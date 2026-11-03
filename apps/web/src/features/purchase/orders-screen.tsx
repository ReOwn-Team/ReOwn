"use client";

import { FilterTabs } from "@/components/ui/filter-tabs";
import { useState } from "react";
import Link from "next/link";

import { money, type MockOrder, type OrderStatus } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { EmptyState } from "@/components/ui/empty-state";

import { deliveryName } from "@/features/purchase/order-format";
import { paymentName } from "@/features/purchase/order-format";
import { ProductLine } from "@/features/purchase/components/order-summary";
import { StatusBadge } from "@/features/purchase/components/order-summary";
import { ReviewDialog } from "@/features/purchase/components/review-dialog";
const filters: Array<OrderStatus | "Tất cả"> = [
    "Tất cả",
    "Chờ thanh toán",
    "Chờ xác nhận",
    "Chuẩn bị hàng",
    "Đang giao",
    "Hoàn tất",
    "Đã hủy",
];
export function OrdersScreen() {
    return (
        <AuthGate loadingVariant="list" title="Đăng nhập để xem đơn mua">
            <OrdersContent />
        </AuthGate>
    );
}
function OrdersContent() {
    const { orders, catalog } = useMock();
    const [filter, setFilter] = useState<OrderStatus | "Tất cả">("Tất cả");
    const [reviewing, setReviewing] = useState<MockOrder | null>(null);
    const visible = orders.filter(
        (o) => filter === "Tất cả" || o.status === filter,
    );
    return (
        <div className="container page purchase-page">
            <p className="muted">
                Theo dõi món đồ bạn đã mua, từ lúc đặt hàng đến khi nhận được.
            </p>
            <FilterTabs
                value={filter}
                onValueChange={setFilter}
                label="Lọc đơn mua"
                items={filters.map((value) => ({
                    value,
                    label: value,
                    count: orders.filter(
                        (order) => value === "Tất cả" || order.status === value,
                    ).length,
                }))}
            />
            <div className="stack">
                {visible.length ? (
                    visible.map((order) => {
                        const product =
                            order.product ??
                            catalog.find((p) => p.id === order.productId);
                        if (!product) return null;
                        return (
                            <article
                                className="purchase-card order-list-card"
                                key={order.id}
                            >
                                <div className="purchase-card-heading">
                                    <span className="small muted">
                                        {order.id}
                                    </span>
                                    <StatusBadge status={order.status} />
                                </div>
                                <div className="order-list-main">
                                    <ProductLine product={product} />
                                    <div className="order-list-total">
                                        <span className="small muted">
                                            Tổng thanh toán
                                        </span>
                                        <b>{money(order.total)}</b>
                                    </div>
                                </div>
                                <div className="order-list-actions">
                                    <p className="small muted">
                                        {paymentName(order.months)} ·{" "}
                                        {deliveryName(order.delivery)}
                                    </p>
                                    <div className="action-row">
                                        <Link
                                            href={`/orders/${order.id}`}
                                            className="button secondary"
                                        >
                                            Chi tiết đơn
                                        </Link>
                                        {order.status === "Chờ thanh toán" && (
                                            <Link
                                                className="button primary"
                                                href={`/orders/${order.id}`}
                                            >
                                                Thanh toán
                                            </Link>
                                        )}
                                        {order.status === "Hoàn tất" && (
                                            <button
                                                className="button primary"
                                                disabled={!!order.review}
                                                onClick={() =>
                                                    setReviewing(order)
                                                }
                                            >
                                                {order.review
                                                    ? "Đã đánh giá"
                                                    : "Đánh giá giao dịch"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })
                ) : (
                    <EmptyState title="Chưa có đơn hàng ở trạng thái này">
                        Đổi bộ lọc để xem các đơn khác.
                    </EmptyState>
                )}
            </div>
            {reviewing && (
                <ReviewDialog
                    order={reviewing}
                    onClose={() => setReviewing(null)}
                />
            )}
        </div>
    );
}
