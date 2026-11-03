"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Info } from "lucide-react";

import { money } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import "@/features/account/components/installments-tab.css";

export function InstallmentsTab() {
    const { orders, catalog, ready, persistenceError } = useMock();
    const installments = orders.filter((order) => order.months > 1);

    return (
        <section className="installments" aria-labelledby="installments-title">
            <header className="installments-heading">
                <div>
                    <h1 id="installments-title">Trả sau</h1>
                    <p>Xem lại các đơn đã chọn chia theo kỳ và lịch minh họa của từng đơn.</p>
                </div>
                <Link href="/help?topic=installments" className="installments-help">
                    Tìm hiểu trả sau <ArrowRight size={16} aria-hidden="true" />
                </Link>
            </header>

            <div className="installments-notice">
                <Info size={19} aria-hidden="true" />
                <div>
                    <strong>Dữ liệu minh họa</strong>
                    <p>
                        Các đơn demo được lưu trên thiết bị này, không đồng bộ theo tài khoản.
                        Lịch chia kỳ chỉ để tham khảo; không có khoản trả sau hoặc thanh toán thật.
                    </p>
                </div>
            </div>

            {persistenceError && <p className="installments-storage-error" role="status">{persistenceError}</p>}

            <div className="installments-list-panel">
                <div className="installments-list-heading">
                    <div>
                        <h2>Đơn chia kỳ</h2>
                        <p>Chọn một đơn để xem lịch thanh toán minh họa.</p>
                    </div>
                    {ready && installments.length > 0 && (
                        <span>{installments.length} đơn</span>
                    )}
                </div>
                {!ready ? (
                    <p className="installments-loading" role="status">Đang tải dữ liệu trên thiết bị…</p>
                ) : installments.length === 0 ? (
                    <div className="installments-empty">
                        <CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />
                        <h3>Chưa có đơn chia kỳ</h3>
                        <p>Khi bạn chọn chia theo tháng cho một đơn demo, đơn đó sẽ xuất hiện tại đây.</p>
                        <Link href="/orders" className="installments-empty-link">
                            Xem đơn mua <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                    </div>
                ) : (
                    <ul className="installments-list">
                        {installments.map((order) => {
                            const product = order.product ?? catalog.find((item) => item.id === order.productId);
                            return (
                                <li key={order.id}>
                                    <article className="installments-order">
                                        <div className="installments-order-top">
                                            <span>{order.id}</span>
                                            <span>Trạng thái đơn: {order.status}</span>
                                        </div>
                                        <div className="installments-order-main">
                                            {product && (
                                                <Image src={product.image} alt="" width={76} height={76} />
                                            )}
                                            <div className="installments-order-product">
                                                <h3>{product?.name ?? "Sản phẩm không còn trong danh mục"}</h3>
                                                <p>Chia thành {order.months} kỳ · Minh họa</p>
                                            </div>
                                            <div className="installments-order-total">
                                                <span>Tổng đơn demo</span>
                                                <strong>{money(order.total)}</strong>
                                            </div>
                                        </div>
                                        <div className="installments-order-footer">
                                            <span>Lịch chia kỳ không thể hiện trạng thái thanh toán từng kỳ.</span>
                                            <Link href={`/orders/${order.id}`}>
                                                Xem lịch và chi tiết đơn <ArrowRight size={16} aria-hidden="true" />
                                            </Link>
                                        </div>
                                    </article>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
