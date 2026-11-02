"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowRight,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    Info,
    ShoppingBag,
} from "lucide-react";
import type { Product } from "@/mocks/data";
import { useAuth } from "@/lib/auth/provider";
import { useMock } from "@/mocks/store";
import { getProduct, realProductId } from "@/lib/products/client";
import { Button } from "@/components/primitives/button";
import { PurchaseDock } from "./components/purchase-dock";
import { PricePreview } from "./components/price-preview";
import { ProductGallery } from "./components/product-gallery";
import { ProductInformation } from "./components/product-information";
import { ProductSeller } from "./components/product-seller";
import { ProductFulfillment } from "./components/product-fulfillment";
import { SaveButton } from "@/features/saved/components/save-button";
import { ProductGrid } from "@/features/products/components/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingScreen } from "@/components/ui/loading-screen";

function ProductScreen({ product }: { product: Product }) {
    const router = useRouter();
    const [months, setMonths] = useState(1);
    const { markViewed, catalog, listings } = useMock();
    const products = catalog.filter(
        (item) => !item.sold && item.id !== product.id,
    );
    const listing = listings.find((item) => item.id === product.id);
    const sold = listing?.status === "Đã bán" || Boolean(product.sold);
    const hidden =
        listing?.status === "Đã ẩn" ||
        ("status" in product && product.status === "Đã ẩn");
    const pending =
        "reviewStatus" in product && product.reviewStatus === "pending";
    const awaitingSellerConfirmation =
        "reviewStatus" in product &&
        product.reviewStatus === "seller_confirmation";
    const related = [
        ...products.filter((item) => item.category === product.category),
        ...products.filter((item) => item.category !== product.category),
    ].slice(0, 4);
    const canOrder =
        !product.live &&
        !sold &&
        !hidden &&
        !pending &&
        !awaitingSellerConfirmation;
    useEffect(() => {
        markViewed(product.id);
    }, [product.id, markViewed]);
    function order() {
        const query = new URLSearchParams({ product: product.id });
        if (months > 1) query.set("months", String(months));
        router.push(`/checkout?${query.toString()}`);
    }
    return (
        <div className="container page product-page">
            <nav className="product-breadcrumb" aria-label="Đường dẫn">
                <Link href="/">Trang chủ</Link>
                <ChevronRight aria-hidden="true" />
                <Link
                    href={`/browse?category=${encodeURIComponent(product.category)}`}
                >
                    {product.category}
                </Link>
                <ChevronRight aria-hidden="true" />
                <span aria-current="page">{product.name}</span>
            </nav>
            <div className="product-overview">
                <ProductGallery product={product} />
                <section
                    className="product-purchase"
                    aria-labelledby="product-title"
                >
                    <div className="product-heading-meta">
                        <Link
                            href={`/browse?category=${encodeURIComponent(product.category)}`}
                        >
                            {product.category}
                        </Link>
                    </div>
                    <h1 id="product-title">{product.name}</h1>
                    <PricePreview
                        price={product.price}
                        months={months}
                        onMonthsChange={setMonths}
                    />
                    {(sold ||
                        hidden ||
                        pending ||
                        awaitingSellerConfirmation) && (
                        <p className="product-availability">
                            {sold
                                ? "Sản phẩm đã được bán."
                                : hidden
                                  ? "Tin đăng hiện đang ẩn."
                                  : awaitingSellerConfirmation
                                    ? "Tin đăng đang chờ người bán xác nhận."
                                    : "Tin đăng đang chờ xét duyệt."}
                        </p>
                    )}
                    <dl className="product-buying-facts">
                        <div>
                            <dt>
                                <ClipboardCheck aria-hidden="true" />
                                Tình trạng
                            </dt>
                            <dd>
                                <span className="product-condition-label">
                                    {product.condition}
                                </span>
                            </dd>
                        </div>
                        {product.defects.trim() && (
                            <div>
                                <dt>
                                    <Info aria-hidden="true" />
                                    Cần lưu ý
                                </dt>
                                <dd>
                                    <p className="product-defects-summary">
                                        {product.defects}
                                    </p>
                                    <a
                                        href="#tinh-trang"
                                        className="product-facts-more"
                                    >
                                        Xem tình trạng
                                        <ChevronRight aria-hidden="true" />
                                    </a>
                                </dd>
                            </div>
                        )}
                        {product.posted && (
                            <div>
                                <dt>
                                    <Clock3 aria-hidden="true" />
                                    Đăng bán
                                </dt>
                                <dd>{product.posted}</dd>
                            </div>
                        )}
                    </dl>
                    <ProductFulfillment product={product} />
                    <div className="product-actions">
                        <Button
                            className="product-order-button"
                            variant="outline"
                            size="lg"
                            type="button"
                            disabled={!canOrder}
                            onClick={order}
                        >
                            <ShoppingBag
                                aria-hidden="true"
                                data-icon="inline-start"
                            />
                            {sold
                                ? "Sản phẩm đã bán"
                                : hidden
                                  ? "Tin đăng đang ẩn"
                                  : awaitingSellerConfirmation
                                    ? "Chờ người bán xác nhận"
                                    : "Đặt hàng"}
                        </Button>
                        <SaveButton id={product.id} />
                    </div>
                    <p className="product-checkout-note">
                        {product.live
                            ? "Sản phẩm này hiện chưa hỗ trợ đặt hàng trực tuyến."
                            : "Kiểm tra cách thanh toán và giao nhận ở bước tiếp theo. Thanh toán là mô phỏng."}
                    </p>
                </section>
                <ProductSeller
                    product={product}
                    listingCount={
                        product.live
                            ? null
                            : catalog.filter(
                                  (item) =>
                                      item.seller === product.seller &&
                                      !item.sold,
                              ).length
                    }
                />
                <ProductInformation product={product} />
            </div>
            {related.length > 0 && (
                <section
                    className="product-related"
                    aria-labelledby="product-related-title"
                >
                    <div className="section-heading">
                        <div>
                            <h2 id="product-related-title">
                                Có thể bạn cũng thích
                            </h2>
                            <p>Thêm vài món đồ để bạn lựa chọn.</p>
                        </div>
                        <Link
                            className="product-inline-link"
                            href={`/browse?category=${encodeURIComponent(product.category)}`}
                        >
                            Xem thêm
                            <ArrowRight aria-hidden="true" />
                        </Link>
                    </div>
                    <ProductGrid items={related} />
                    <p className="product-related-note">
                        * Ước tính mỗi tháng từ giá sản phẩm, chưa gồm phí giao
                        nhận.
                    </p>
                </section>
            )}
            {canOrder && (
                <PurchaseDock price={product.price} onContinue={order} />
            )}
        </div>
    );
}

export function ProductRoute({ id }: { id: string }) {
    const { catalog, listings, ready } = useMock();
    const auth = useAuth();
    const viewerId = auth.user?.id;
    const loadKey = `${id}:${viewerId ?? ""}`;
    const [loadedKey, setLoadedKey] = useState("");
    const [remote, setRemote] = useState<Product | null>(null);
    const [loading, setLoading] = useState(realProductId(id));
    const [error, setError] = useState("");
    useEffect(() => {
        if (!realProductId(id)) return;
        let active = true;
        getProduct(id)
            .catch((error) => {
                if (error.status === 404 && viewerId)
                    return getProduct(id, true);
                throw error;
            })
            .then((value) => {
                if (active) setRemote(value);
            })
            .catch((error) => {
                if (active) {
                    setRemote(null);
                    setError(error.message);
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                    setLoadedKey(loadKey);
                }
            });
        return () => {
            active = false;
        };
    }, [id, viewerId, loadKey]);
    if (!ready || loading || (realProductId(id) && loadedKey !== loadKey))
        return <LoadingScreen variant="detail" />;
    const product = realProductId(id)
        ? remote
        : (catalog.find((p) => p.id === id) ??
          listings.find((p) => p.id === id));
    if (!product)
        return (
            <div className="container page">
                <EmptyState title="Không tìm thấy sản phẩm">
                    {error || "Sản phẩm không còn hiển thị."}
                </EmptyState>
            </div>
        );
    return <ProductScreen key={id} product={product} />;
}
