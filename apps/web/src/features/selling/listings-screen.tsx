"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
    deleteProduct,
    listProducts,
    setProductStatus,
} from "@/lib/products/client";

import { FilterTabs } from "@/components/ui/filter-tabs";
import { Button } from "@/components/primitives/button";
import { ListingActions } from "./components/listing-actions";
import { ListingDetailDialog } from "./components/listing-detail-dialog";
import { LoadingScreen } from "@/components/ui/loading-screen";
import Image from "next/image";

import { Plus } from "lucide-react";
import { money, type Listing } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

export function ListingsScreen() {
    return (
        <AuthGate loadingVariant="list" title="Đăng nhập để quản lý tin đăng">
            <ListingsContent />
        </AuthGate>
    );
}
function ListingsContent() {
    const { notify } = useMock();
    const searchInput = useRef<HTMLInputElement>(null);
    function focusAfterAction(id?: string) {
        requestAnimationFrame(() => {
            const action = id
                ? document
                      .getElementById(`listing-${id}`)
                      ?.querySelector<HTMLButtonElement>("button")
                : null;
            (action ?? searchInput.current)?.focus();
        });
    }
    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(true);
    const [requestError, setRequestError] = useState("");
    const [busy, setBusy] = useState(false);
    const [actionTrigger, setActionTrigger] =
        useState<HTMLButtonElement | null>(null);
    const [detail, setDetail] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<Listing | null>(null);
    const [search, setSearch] = useState("");
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        listProducts(true)
            .then((value) => {
                if (active) {
                    setListings(value);
                    setRequestError("");
                }
            })
            .catch((error) => {
                if (active) setRequestError(error.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [reload]);
    const [filter, setFilter] = useState("Tất cả");
    const [selling, setSelling] = useState<Listing | null>(null);
    const labels = [
        "Tất cả",
        "Chờ duyệt",
        "Chờ xác nhận",
        "Bị từ chối",
        "Đang hiển thị",
        "Đã ẩn",
        "Đã bán",
    ];
    async function status(id: string, value: Listing["status"]) {
        if (busy) return;
        setBusy(true);
        setRequestError("");
        try {
            const updated = await setProductStatus(id, value);
            setListings((current) =>
                current.map((item) => (item.id === id ? updated : item)),
            );
            notify(`Tin đăng: ${value.toLocaleLowerCase("vi")}.`);
            setSelling(null);
            if (
                value === "Đã bán" ||
                (filter !== "Tất cả" && updated.status !== filter)
            )
                focusAfterAction(id);
        } catch (error) {
            setRequestError(
                error instanceof Error
                    ? error.message
                    : "Chưa thể cập nhật tin.",
            );
        } finally {
            setBusy(false);
        }
    }
    const matches = (listing: Listing) =>
        (filter === "Tất cả" || listing.status === filter) &&
        listing.name
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi"));
    async function remove() {
        if (!deleting || busy) return;
        setBusy(true);
        setRequestError("");
        try {
            await deleteProduct(deleting.id);
            setListings((items) =>
                items.filter((item) => item.id !== deleting.id),
            );
            setDeleting(null);
            notify("Đã xóa tin đăng.");
            focusAfterAction();
        } catch (error) {
            setRequestError(
                error instanceof Error ? error.message : "Chưa thể xóa tin.",
            );
        } finally {
            setBusy(false);
        }
    }
    if (loading) return <LoadingScreen variant="list" />;
    return (
        <div className="container page">
            <div className="section-heading">
                <div>
                    <h1>Quản lý tin đăng</h1>
                    <p className="muted">
                        Giữ tin của bạn luôn đúng trạng thái, để người mua biết
                        món đồ nào còn bán.
                    </p>
                </div>
                <div className="action-row">
                    <Link className="button secondary" href="/sales">
                        Đơn bán
                    </Link>
                    <Link className="button primary" href="/sell">
                        <Plus size={18} />
                        Đăng tin mới
                    </Link>
                </div>
            </div>
            {requestError && (
                <div className="panel stack">
                    <p className="error" role="alert">
                        {requestError}
                    </p>
                    <button
                        className="button secondary"
                        onClick={() => setReload((value) => value + 1)}
                    >
                        Thử lại
                    </button>
                </div>
            )}
            <label className="field listing-search">
                Tìm tin của bạn
                <input
                    ref={searchInput}
                    type="search"
                    placeholder="Nhập tên sản phẩm"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </label>
            <FilterTabs
                value={filter}
                onValueChange={setFilter}
                label="Lọc tin đăng"
                items={labels.map((label) => ({
                    value: label,
                    label,
                    count: listings.filter(
                        (listing) =>
                            label === "Tất cả" || listing.status === label,
                    ).length,
                }))}
            />
            <div className="stack">
                {listings.filter(matches).map((listing) => (
                    <article
                        className="panel listing-card"
                        id={`listing-${listing.id}`}
                        key={listing.id}
                    >
                        <div className="section-heading">
                            <span className="small muted">
                                TIN{" "}
                                {listing.id
                                    .replace("listing-", "")
                                    .slice(0, 12)
                                    .toUpperCase()}
                            </span>
                            <span
                                className={`badge ${listing.status === "Đã bán" ? "success" : "neutral"}`}
                            >
                                {listing.status}
                            </span>
                        </div>
                        <div className="listing-card-main">
                            <Image
                                src={listing.image}
                                unoptimized
                                width={112}
                                height={100}
                                alt=""
                            />
                            <div>
                                {listing.status === "Đang hiển thị" ? (
                                    <Link href={`/products/${listing.id}`}>
                                        {listing.name}
                                    </Link>
                                ) : (
                                    <strong>{listing.name}</strong>
                                )}
                                <p className="small muted">
                                    {listing.condition} · {listing.location}
                                </p>
                                <span className="small muted">
                                    Một sản phẩm · Tin đăng của bạn
                                </span>
                            </div>
                            <strong>{money(listing.price)}</strong>
                        </div>
                        <div className="listing-card-actions">
                            <p className="small muted">
                                {listing.status === "Chờ duyệt"
                                    ? "Tin chưa công khai, đang chờ quản trị viên xem xét."
                                    : listing.status === "Chờ xác nhận"
                                      ? "Quản trị viên đã điều chỉnh tin. Hãy xác nhận tên và giá để đăng; tin chưa công khai."
                                      : listing.status === "Bị từ chối"
                                        ? `Cần chỉnh sửa: ${listing.rejectionReason ?? "Vui lòng cập nhật ảnh và thông tin rồi gửi lại."}`
                                        : listing.status === "Đang hiển thị"
                                          ? "Tin đang hiển thị để người mua tìm thấy."
                                          : listing.status === "Đã ẩn"
                                            ? "Tin đã được tạm ẩn."
                                            : "Sản phẩm đã bán. Tin không còn nhận đơn mới."}
                            </p>
                            <div className="action-row">
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    aria-label="Xem tin & kiểm tra ảnh"
                                    onClick={() => setDetail(listing.id)}
                                >
                                    Xem tin
                                </Button>
                                {listing.status !== "Đã bán" && (
                                    <>
                                        <Button variant="outline" asChild>
                                            <Link
                                                href={`/sell?edit=${listing.id}`}
                                            >
                                                Chỉnh sửa
                                            </Link>
                                        </Button>
                                        <ListingActions
                                            listing={listing}
                                            disabled={busy}
                                            onAction={(action, trigger) => {
                                                setActionTrigger(trigger);
                                                setRequestError("");
                                                if (action === "delete")
                                                    setDeleting(listing);
                                                else if (action === "sold")
                                                    setSelling(listing);
                                                else
                                                    void status(
                                                        listing.id,
                                                        action === "show"
                                                            ? "Đang hiển thị"
                                                            : "Đã ẩn",
                                                    );
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                    </article>
                ))}
                {!requestError && !listings.some(matches) && (
                    <EmptyState title="Chưa có tin đăng ở trạng thái này">
                        Thử chọn một bộ lọc khác hoặc đăng món đồ đầu tiên.
                    </EmptyState>
                )}
            </div>
            {detail && (
                <ListingDetailDialog
                    id={detail}
                    onClose={() => setDetail(null)}
                />
            )}
            {deleting && (
                <Dialog
                    title="Xóa tin đăng"
                    returnFocus={actionTrigger}
                    onClose={() => setDeleting(null)}
                >
                    <div className="stack">
                        <h2>Xóa tin “{deleting.name}”?</h2>
                        <p>
                            Tin sẽ được gỡ khỏi danh sách và người mua không thể
                            xem nữa. Lịch sử xét duyệt được giữ lại. Thao tác
                            này không có nút hoàn tác.
                        </p>
                        {requestError && (
                            <p className="error" role="alert">
                                {requestError}
                            </p>
                        )}
                        <div className="action-row">
                            <button
                                className="button primary"
                                disabled={busy}
                                onClick={remove}
                            >
                                {busy ? "Đang xóa…" : "Xác nhận xóa tin"}
                            </button>
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => setDeleting(null)}
                            >
                                Giữ tin
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
            {selling && (
                <Dialog
                    title="Đánh dấu đã bán"
                    returnFocus={actionTrigger}
                    onClose={() => setSelling(null)}
                >
                    <div className="stack">
                        <h2>Đã bán {selling.name}?</h2>
                        <p>Tin sẽ ngừng nhận đơn mới.</p>
                        {requestError && (
                            <p className="error" role="alert">
                                {requestError}
                            </p>
                        )}
                        <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => {
                                void status(selling.id, "Đã bán");
                            }}
                        >
                            Xác nhận đã bán
                        </button>
                        <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => setSelling(null)}
                        >
                            Quay lại
                        </button>
                    </div>
                </Dialog>
            )}
        </div>
    );
}
