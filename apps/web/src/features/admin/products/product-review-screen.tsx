"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    decideProductReview,
    editProductReview,
    getProductReview,
    listProductReviews,
    productReviewImageUrl,
    ReviewRequestError,
    type ProductReviewChanges,
    type ReviewDetail,
    type ReviewSummary,
} from "@/lib/admin/products";
import styles from "./product-review.module.css";

const date = (value: string) => new Date(value).toLocaleString("vi-VN");
const statusLabels: Record<string, string> = {
    queued: "Đang chờ",
    processing: "Đang xử lý",
    completed: "Hoàn tất",
    failed: "Thất bại",
    cancelled: "Đã hủy",
};
const statusLabel = (status: string) => statusLabels[status] ?? status;
const message = (error: unknown) =>
    error instanceof Error
        ? error.message
        : "Không xử lý được yêu cầu. Vui lòng thử lại.";

/** Mount inside the admin shell; authorization is enforced by the backend. */
export function ProductReviewScreen() {
    const router = useRouter();
    const [queue, setQueue] = useState<ReviewSummary[] | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    const load = useCallback(async (cursor?: string) => {
        setLoading(true);
        setError("");
        try {
            const rows = await listProductReviews(cursor);
            setQueue((previous) =>
                cursor
                    ? [
                          ...(previous ?? []),
                          ...rows.filter(
                              (row) =>
                                  !previous?.some((item) => item.id === row.id),
                          ),
                      ]
                    : rows,
            );
            setHasMore(rows.length > 0);
        } catch (cause) {
            setError(message(cause));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    return (
        <section className={styles.screen}>
            <header className={styles.header}>
                <div>
                    <h1>Duyệt sản phẩm</h1>
                    <p>
                        Kiểm tra thông tin và ảnh trước khi quyết định đăng bán.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setNotice("");
                        void load();
                    }}
                    disabled={loading}
                >
                    Tải lại danh sách
                </button>
            </header>
            {notice && (
                <p role="status" className={styles.notice}>
                    {notice}
                </p>
            )}
            {error && (
                <p role="alert" className={styles.error}>
                    {error}
                </p>
            )}
            <div className={styles.layout}>
                <nav aria-label="Sản phẩm chờ duyệt" className={styles.queue}>
                    <h2>Chờ duyệt{queue ? ` (${queue.length})` : ""}</h2>
                    {queue === null ? (
                        loading ? (
                            <p role="status">Đang tải danh sách…</p>
                        ) : (
                            <p>Chưa tải được danh sách.</p>
                        )
                    ) : queue.length === 0 ? (
                        <p>Không có sản phẩm chờ duyệt.</p>
                    ) : (
                        <ul>
                            {queue.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                `/admin/products/${item.id}`,
                                            )
                                        }
                                    >
                                        <strong>{item.product.title}</strong>
                                        <span>
                                            {date(item.createdAt)} · Phiên bản{" "}
                                            {item.revision}
                                        </span>
                                        <span>
                                            Kiểm tra ảnh:{" "}
                                            {item.inspections[0]
                                                ? statusLabel(
                                                      item.inspections[0]
                                                          .status,
                                                  )
                                                : "Chưa có"}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {queue && queue.length > 0 && hasMore && (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                                void load(queue[queue.length - 1].id)
                            }
                        >
                            {loading ? "Đang tải…" : "Tải thêm"}
                        </button>
                    )}
                </nav>
            </div>
        </section>
    );
}

export function ProductReviewDetailScreen({ id }: { id: string }) {
    const router = useRouter();
    return (
        <section className={styles.screen}>
            <header className={styles.header}>
                <div>
                    <h1>Kiểm duyệt sản phẩm</h1>
                    <p>
                        Đối chiếu nội dung, ảnh và kết quả kiểm tra trước khi ra
                        quyết định.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => router.push("/admin/products")}
                >
                    Quay lại danh sách
                </button>
            </header>
            <Detail
                id={id}
                onDone={() => router.push("/admin/products")}
                onRefresh={() => router.push("/admin/products")}
            />
        </section>
    );
}

function Detail({
    id,
    onDone,
    onRefresh,
}: {
    id: string;
    onDone: (outcome: "approve" | "reject" | "edit") => void;
    onRefresh: () => void;
}) {
    const [detail, setDetail] = useState<ReviewDetail | null>(null);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [changes, setChanges] = useState<ReviewDetail["snapshot"] | null>(
        null,
    );
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    useEffect(() => {
        let active = true;
        getProductReview(id)
            .then((value) => {
                if (active) {
                    setDetail(value);
                    setChanges(value.snapshot);
                }
            })
            .catch((cause: unknown) => {
                if (active) setError(message(cause));
            });
        return () => {
            active = false;
        };
    }, [id]);
    async function decide(decision: "approve" | "reject") {
        if (!detail || busy || uncertain) return;
        if (decision === "reject" && !reason.trim()) {
            setError("Nhập lý do từ chối.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await decideProductReview(id, {
                revision: detail.revision,
                decision,
                ...(decision === "reject" ? { reason: reason.trim() } : {}),
            });
            onDone(decision);
        } catch (cause) {
            setError(message(cause));
            // A lost response can follow a committed decision; do not resend blindly.
            if (
                !(cause instanceof ReviewRequestError) ||
                cause.status === 0 ||
                cause.status === 409 ||
                cause.status >= 500 ||
                cause.status === 404
            )
                setUncertain(true);
        } finally {
            setBusy(false);
        }
    }
    async function edit() {
        if (!detail || !changes || busy || uncertain) return;
        const changed: ProductReviewChanges = {};
        if (changes.title !== detail.snapshot.title)
            changed.title = changes.title;
        if (changes.category !== detail.snapshot.category)
            changed.category = changes.category;
        if (changes.description !== detail.snapshot.description)
            changed.description = changes.description;
        if (changes.condition !== detail.snapshot.condition)
            changed.condition = changes.condition;
        if (changes.knownDefects !== detail.snapshot.knownDefects)
            changed.knownDefects = changes.knownDefects;
        if (changes.location !== detail.snapshot.location)
            changed.location = changes.location;
        if (
            changes.fulfillmentMethods.length !==
                detail.snapshot.fulfillmentMethods.length ||
            changes.fulfillmentMethods.some(
                (value, index) =>
                    value !== detail.snapshot.fulfillmentMethods[index],
            )
        )
            changed.fulfillmentMethods = changes.fulfillmentMethods;
        if (!Object.keys(changed).length) return;
        setBusy(true);
        setError("");
        try {
            await editProductReview(id, {
                revision: detail.revision,
                changes: changed,
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            onDone("edit");
        } catch (cause) {
            setError(message(cause));
            if (
                !(cause instanceof ReviewRequestError) ||
                cause.status === 0 ||
                cause.status === 409 ||
                cause.status >= 500 ||
                cause.status === 404
            )
                setUncertain(true);
        } finally {
            setBusy(false);
        }
    }
    if (!detail || !changes)
        return (
            <div className={styles.detail}>
                {error ? (
                    <>
                        <p role="alert" className={styles.error}>
                            {error}
                        </p>
                        <button type="button" onClick={onRefresh}>
                            Tải lại danh sách
                        </button>
                    </>
                ) : (
                    <p role="status">Đang mở hồ sơ…</p>
                )}
            </div>
        );
    const current =
        detail.status === "pending" &&
        detail.product.reviewStatus === "pending" &&
        detail.product.revision === detail.revision &&
        !detail.product.deletedAt;
    const snapshot = detail.snapshot;
    const hasChanges =
        changes.title !== snapshot.title ||
        changes.category !== snapshot.category ||
        changes.description !== snapshot.description ||
        changes.condition !== snapshot.condition ||
        changes.knownDefects !== snapshot.knownDefects ||
        changes.location !== snapshot.location ||
        changes.fulfillmentMethods.length !==
            snapshot.fulfillmentMethods.length ||
        changes.fulfillmentMethods.some(
            (value, index) => value !== snapshot.fulfillmentMethods[index],
        );
    const updateChange = <K extends keyof ProductReviewChanges>(
        key: K,
        value: ProductReviewChanges[K],
    ) =>
        setChanges((current) =>
            current ? { ...current, [key]: value } : current,
        );
    return (
        <article className={styles.detail} aria-busy={busy}>
            <header>
                <p className={styles.muted}>
                    Phiên bản {detail.revision} · {date(detail.createdAt)}
                </p>
                <h2>{snapshot.title}</h2>
                <p className={styles.price}>
                    {snapshot.price.toLocaleString("vi-VN")} ₫
                </p>
            </header>
            {!current && (
                <p className={styles.error}>
                    Hồ sơ không còn là phiên bản chờ duyệt hiện tại. Tải lại
                    danh sách trước khi tiếp tục.
                </p>
            )}
            <dl className={styles.facts}>
                <div>
                    <dt>Danh mục</dt>
                    <dd>{snapshot.category}</dd>
                </div>
                <div>
                    <dt>Tình trạng</dt>
                    <dd>{snapshot.condition}</dd>
                </div>
                <div>
                    <dt>Khu vực</dt>
                    <dd>{snapshot.location}</dd>
                </div>
                <div>
                    <dt>Giao nhận</dt>
                    <dd>
                        {snapshot.fulfillmentMethods.join(", ") || "Không có"}
                    </dd>
                </div>
                <div>
                    <dt>Mã sản phẩm</dt>
                    <dd>{detail.productId}</dd>
                </div>
                <div>
                    <dt>Mã hồ sơ</dt>
                    <dd>{detail.id}</dd>
                </div>
            </dl>
            <section>
                <h3>Mô tả</h3>
                <p className={styles.preserve}>{snapshot.description}</p>
                <h3>Lỗi đã khai báo</h3>
                <p className={styles.preserve}>
                    {snapshot.knownDefects || "Không có"}
                </p>
            </section>
            <section>
                <h3>Ảnh sản phẩm</h3>
                <p className={styles.muted}>
                    Ảnh hiển thị đã loại bỏ metadata. Ảnh gốc và thông tin chụp
                    là dữ liệu riêng tư.
                </p>
                {snapshot.images.length === 0 ? (
                    <p>Không có ảnh.</p>
                ) : (
                    <div className={styles.images}>
                        {snapshot.images.map((image, index) => (
                            <Photo
                                key={image.id}
                                reviewId={id}
                                imageId={image.id}
                                number={index + 1}
                                evidence={detail.evidence.find(
                                    (item) => item.id === image.id,
                                )}
                            />
                        ))}
                    </div>
                )}
            </section>
            <section>
                <h3>Lịch sử kiểm tra ảnh</h3>
                <p className={styles.muted}>
                    Kết quả kiểm tra chỉ là quan sát, không phải quyết định
                    duyệt.
                </p>
                {detail.inspections.length === 0 ? (
                    <p>Chưa có lượt kiểm tra.</p>
                ) : (
                    detail.inspections.map((inspection) => (
                        <div className={styles.inspection} key={inspection.id}>
                            <strong>{statusLabel(inspection.status)}</strong> ·{" "}
                            {date(inspection.createdAt)} · Lần thử:{" "}
                            {inspection.attempts}
                            {inspection.errorCode && (
                                <p>Mã lỗi: {inspection.errorCode}</p>
                            )}
                            {inspection.report && (
                                <>
                                    <p className={styles.preserve}>
                                        {inspection.report.summary}
                                    </p>
                                    {(
                                        [
                                            [
                                                "Quan sát sản phẩm",
                                                inspection.report
                                                    .productObservations,
                                            ],
                                            [
                                                "Lỗi nhìn thấy",
                                                inspection.report
                                                    .visibleDefects,
                                            ],
                                            [
                                                "Chất lượng ảnh",
                                                inspection.report.imageQuality,
                                            ],
                                            [
                                                "Điểm không nhất quán",
                                                inspection.report
                                                    .inconsistencies,
                                            ],
                                        ] as const
                                    ).map(
                                        ([label, findings]) =>
                                            findings.length > 0 && (
                                                <div key={label}>
                                                    <h4>{label}</h4>
                                                    <ul>
                                                        {findings.map(
                                                            (
                                                                finding,
                                                                index,
                                                            ) => (
                                                                <li key={index}>
                                                                    <span
                                                                        className={
                                                                            styles.preserve
                                                                        }
                                                                    >
                                                                        {
                                                                            finding.observation
                                                                        }
                                                                    </span>{" "}
                                                                    —{" "}
                                                                    {
                                                                        finding.evidence
                                                                    }{" "}
                                                                    · Độ chắc
                                                                    chắn:{" "}
                                                                    {
                                                                        finding.certainty
                                                                    }
                                                                    <br />
                                                                    <span
                                                                        className={
                                                                            styles.muted
                                                                        }
                                                                    >
                                                                        Mã ảnh:{" "}
                                                                        {finding.imageIds.join(
                                                                            ", ",
                                                                        )}
                                                                    </span>
                                                                </li>
                                                            ),
                                                        )}
                                                    </ul>
                                                </div>
                                            ),
                                    )}
                                    <h4>Giới hạn</h4>
                                    <ul>
                                        {inspection.report.limitations.map(
                                            (item, index) => (
                                                <li key={index}>{item}</li>
                                            ),
                                        )}
                                    </ul>
                                </>
                            )}
                        </div>
                    ))
                )}
            </section>
            <section className={styles.decision}>
                <h3>Chỉnh sửa thông tin trước khi người bán xác nhận</h3>
                <p className={styles.muted}>
                    Chỉ chỉnh sửa metadata cần thiết. Giá và ảnh được giữ
                    nguyên.
                </p>
                <div className={styles.correctionGrid}>
                    <label>
                        Tên sản phẩm
                        <input
                            value={changes.title}
                            onChange={(event) =>
                                updateChange("title", event.target.value)
                            }
                            disabled={busy || !current || uncertain}
                        />
                    </label>
                    <label>
                        Danh mục
                        <input
                            value={changes.category}
                            onChange={(event) =>
                                updateChange("category", event.target.value)
                            }
                            disabled={busy || !current || uncertain}
                        />
                    </label>
                    <label>
                        Tình trạng
                        <input
                            value={changes.condition}
                            onChange={(event) =>
                                updateChange("condition", event.target.value)
                            }
                            disabled={busy || !current || uncertain}
                        />
                    </label>
                    <label>
                        Khu vực
                        <input
                            value={changes.location}
                            onChange={(event) =>
                                updateChange("location", event.target.value)
                            }
                            disabled={busy || !current || uncertain}
                        />
                    </label>
                </div>
                <label>
                    Mô tả
                    <textarea
                        rows={4}
                        value={changes.description}
                        onChange={(event) =>
                            updateChange("description", event.target.value)
                        }
                        disabled={busy || !current || uncertain}
                    />
                </label>
                <label>
                    Lỗi đã khai báo
                    <textarea
                        rows={3}
                        value={changes.knownDefects ?? ""}
                        onChange={(event) =>
                            updateChange(
                                "knownDefects",
                                event.target.value || null,
                            )
                        }
                        disabled={busy || !current || uncertain}
                    />
                </label>
                <fieldset disabled={busy || !current || uncertain}>
                    <legend>Hình thức giao nhận</legend>
                    <label>
                        <input
                            type="checkbox"
                            checked={changes.fulfillmentMethods.includes(
                                "meetup",
                            )}
                            onChange={(event) =>
                                updateChange(
                                    "fulfillmentMethods",
                                    event.target.checked
                                        ? [
                                              ...changes.fulfillmentMethods,
                                              "meetup",
                                          ]
                                        : changes.fulfillmentMethods.filter(
                                              (value) => value !== "meetup",
                                          ),
                                )
                            }
                        />{" "}
                        Gặp trực tiếp
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={changes.fulfillmentMethods.includes(
                                "shipping",
                            )}
                            onChange={(event) =>
                                updateChange(
                                    "fulfillmentMethods",
                                    event.target.checked
                                        ? [
                                              ...changes.fulfillmentMethods,
                                              "shipping",
                                          ]
                                        : changes.fulfillmentMethods.filter(
                                              (value) => value !== "shipping",
                                          ),
                                )
                            }
                        />{" "}
                        Giao hàng
                    </label>
                </fieldset>
                <label htmlFor="product-review-note">
                    Ghi chú gửi người bán (không bắt buộc)
                </label>
                <textarea
                    id="product-review-note"
                    rows={3}
                    value={note}
                    maxLength={2000}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={busy || !current || uncertain}
                />
                <div className={styles.actions}>
                    <button
                        className={styles.primary}
                        type="button"
                        disabled={busy || !current || uncertain || !hasChanges}
                        onClick={() => void edit()}
                    >
                        {busy ? "Đang lưu…" : "Gửi người bán xác nhận"}
                    </button>
                </div>
            </section>
            <section className={styles.decision}>
                <h3>Quyết định</h3>
                <label htmlFor="product-review-reason">Lý do từ chối</label>
                <textarea
                    id="product-review-reason"
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={busy || !current || uncertain}
                />
                <p className={styles.muted}>
                    Bắt buộc khi từ chối; tối đa 2.000 ký tự.
                </p>
                {error && (
                    <p role="alert" className={styles.error}>
                        {error}
                    </p>
                )}
                {uncertain && (
                    <p>
                        Trạng thái có thể đã thay đổi. Tải lại danh sách và kiểm
                        tra trước khi quyết định lại.
                    </p>
                )}
                {(uncertain || !current) && (
                    <button type="button" onClick={onRefresh}>
                        Tải lại danh sách
                    </button>
                )}
                <div className={styles.actions}>
                    <button
                        type="button"
                        disabled={busy || !current || uncertain}
                        onClick={() => void decide("reject")}
                    >
                        Từ chối
                    </button>
                    <button
                        className={styles.primary}
                        type="button"
                        disabled={busy || !current || uncertain}
                        onClick={() => void decide("approve")}
                    >
                        {busy ? "Đang lưu…" : "Duyệt sản phẩm"}
                    </button>
                </div>
            </section>
        </article>
    );
}

function Photo({
    reviewId,
    imageId,
    number,
    evidence,
}: {
    reviewId: string;
    imageId: string;
    number: number;
    evidence: ReviewDetail["evidence"][number] | undefined;
}) {
    const [failed, setFailed] = useState(false);
    const [downloadError, setDownloadError] = useState("");
    const [downloading, setDownloading] = useState(false);
    async function downloadOriginal() {
        setDownloading(true);
        setDownloadError("");
        try {
            const response = await fetch(
                productReviewImageUrl(reviewId, imageId, true),
                { cache: "no-store", credentials: "same-origin" },
            );
            if (!response.ok)
                throw new Error(
                    response.status === 404
                        ? "Ảnh gốc đã hết hạn hoặc không còn khả dụng."
                        : response.status === 401
                          ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                          : response.status === 403
                            ? "Bạn không có quyền tải ảnh này."
                            : "Không tải được ảnh gốc. Vui lòng thử lại.",
                );
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `product-original-${imageId}`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (cause) {
            setDownloadError(message(cause));
        } finally {
            setDownloading(false);
        }
    }
    return (
        <figure>
            <div className={styles.imageBox}>
                {failed ? (
                    <p role="status">Không tải được ảnh. Hãy tải lại hồ sơ.</p>
                ) : (
                    // The authenticated BFF serves private, non-cacheable images.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={productReviewImageUrl(reviewId, imageId)}
                        alt={`Ảnh sản phẩm ${number}`}
                        onError={() => setFailed(true)}
                    />
                )}
            </div>
            <figcaption>
                Ảnh {number} · {imageId}
            </figcaption>
            {evidence && (
                <details>
                    <summary>Thông tin ảnh riêng tư</summary>
                    <dl className={styles.metadata}>
                        <div>
                            <dt>Thời gian chụp</dt>
                            <dd>
                                {evidence.metadata.capturedAtLocal}{" "}
                                {evidence.metadata.utcOffset ?? ""}
                            </dd>
                        </div>
                        <div>
                            <dt>Tọa độ</dt>
                            <dd>
                                {evidence.metadata.latitude},{" "}
                                {evidence.metadata.longitude}
                            </dd>
                        </div>
                        <div>
                            <dt>Thiết bị</dt>
                            <dd>
                                {[
                                    evidence.metadata.make,
                                    evidence.metadata.model,
                                ]
                                    .filter(Boolean)
                                    .join(" ") || "Không có"}
                            </dd>
                        </div>
                        <div>
                            <dt>SHA-256 ảnh gốc</dt>
                            <dd>{evidence.sha256}</dd>
                        </div>
                        <div>
                            <dt>Ảnh gốc hết hạn</dt>
                            <dd>{date(evidence.expiresAt)}</dd>
                        </div>
                    </dl>
                    {!evidence.purgedAt ? (
                        <button
                            type="button"
                            disabled={downloading}
                            onClick={() => void downloadOriginal()}
                        >
                            {downloading
                                ? "Đang tải…"
                                : `Tải ảnh gốc riêng tư (${evidence.originalMime})`}
                        </button>
                    ) : (
                        <p>Ảnh gốc không còn khả dụng.</p>
                    )}
                    {downloadError && (
                        <p role="alert" className={styles.error}>
                            {downloadError}
                        </p>
                    )}
                </details>
            )}
        </figure>
    );
}
