"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/provider";
import {
    getAdminUser,
    listAdminUsers,
    type AdminUserDetail,
    type AdminUsersPage,
    type KycHistoryItem,
} from "@/lib/admin/users";
import {
    getKycReview,
    kycAssetUrl,
    type KycReviewDetail,
} from "@/lib/kyc/client";
import "./users.css";

const message = (error: unknown) =>
    error instanceof Error
        ? error.message
        : "Không xử lý được yêu cầu. Vui lòng thử lại.";
const statusLabel = (status: string) =>
    (
        ({
            active: "Đang hoạt động",
            needs_review: "Đang chờ duyệt",
            verified: "Đã xác thực",
            rejected: "Chưa được duyệt",
            expired: "Đã hết hạn",
            none: "Chưa xác thực",
        }) as Record<string, string>
    )[status] ?? status;
const kycLabel = (status?: number) =>
    status === undefined
        ? "Không có thông tin"
        : ([
              "Chưa xác thực",
              "Đang chờ duyệt",
              "Đã xác thực",
              "Chưa được duyệt",
          ][status] ?? `Không xác định (${status})`);
const date = (value: string | null) => {
    if (!value) return "Chưa có thông tin";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? value
        : parsed.toLocaleString("vi-VN");
};
const roleLabel = (role: string) =>
    role === "admin" ? "Quản trị viên" : role === "user" ? "Người dùng" : role;

export function AdminUsersScreen() {
    const auth = useAuth();
    if (auth.status === "checking")
        return (
            <div className="admin-users" role="status">
                Đang kiểm tra phiên đăng nhập…
            </div>
        );
    if (!auth.user)
        return (
            <div className="admin-users">
                <h1>Quản lý người dùng</h1>
                <p>
                    {auth.error ||
                        "Đăng nhập bằng tài khoản quản trị để tiếp tục."}
                </p>
            </div>
        );
    if (auth.user.role !== "admin")
        return (
            <div className="admin-users">
                <h1>Không có quyền truy cập</h1>
                <p>Chức năng này chỉ dành cho quản trị viên.</p>
            </div>
        );
    return <UsersList />;
}

function UsersList() {
    const searchId = useId();
    const [selected, setSelected] = useState<string | null>(null);
    const [detailTrigger, setDetailTrigger] = useState<HTMLElement | null>(
        null,
    );
    const [input, setInput] = useState("");
    const [search, setSearch] = useState("");
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const [page, setPage] = useState<AdminUsersPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const cursor = cursors[cursors.length - 1];

    useEffect(() => {
        const controller = new AbortController();
        listAdminUsers({ cursor, search, limit: 25 }, controller.signal)
            .then((result) => {
                setPage(result);
                setError("");
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) {
                    setPage(null);
                    setError(message(cause));
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [cursor, search, refresh]);

    function reload() {
        setLoading(true);
        setError("");
        setRefresh((n) => n + 1);
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        const value = input.trim();
        if (value === search) return;
        setLoading(true);
        setError("");
        setCursors([null]);
        setSearch(value);
    }
    return (
        <section className="admin-users" aria-labelledby="admin-users-title">
            <header className="admin-users__header">
                <h1 id="admin-users-title">Quản lý người dùng</h1>
                <p>
                    Tra cứu tài khoản và lịch sử xác thực. Thông tin chỉ để xem.
                </p>
            </header>
            <form
                className="admin-users__filters"
                onSubmit={submit}
                role="search"
            >
                <div className="admin-users__field">
                    <label htmlFor={searchId}>Tìm người dùng</label>
                    <input
                        id={searchId}
                        type="search"
                        maxLength={100}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Tên, email hoặc số điện thoại"
                    />
                </div>
                <button type="submit">Tìm kiếm</button>
            </form>
            {error && (
                <div className="admin-users__feedback" role="alert">
                    <p>{error}</p>
                    <button type="button" onClick={reload}>
                        Thử lại
                    </button>
                </div>
            )}
            {loading ? (
                <p className="admin-users__feedback" role="status">
                    Đang tải danh sách…
                </p>
            ) : (
                !error &&
                page && (
                    <>
                        {page.items.length === 0 ? (
                            <p className="admin-users__feedback" role="status">
                                Không tìm thấy người dùng. Hãy thử từ khóa khác.
                            </p>
                        ) : (
                            <div className="admin-users__table-wrap">
                                <table>
                                    <caption>Danh sách người dùng</caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Tài khoản</th>
                                            <th scope="col">Liên hệ</th>
                                            <th scope="col">Vai trò</th>
                                            <th scope="col">Trạng thái</th>
                                            <th scope="col">Xác thực</th>
                                            <th scope="col">Chi tiết</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {page.items.map((user) => (
                                            <tr key={user.id}>
                                                <th scope="row">
                                                    {user.displayName && (
                                                        <strong>
                                                            {user.displayName}
                                                            <br />
                                                        </strong>
                                                    )}
                                                    {user.id}
                                                </th>
                                                <td>
                                                    {user.email ||
                                                        "Không có thông tin"}
                                                    {user.phone && (
                                                        <>
                                                            <br />
                                                            {user.phone}
                                                        </>
                                                    )}
                                                </td>
                                                <td>{roleLabel(user.role)}</td>
                                                <td>
                                                    <span className="admin-users__status">
                                                        {statusLabel(
                                                            user.status,
                                                        )}
                                                    </span>
                                                </td>
                                                <td>
                                                    {kycLabel(user.kycStatus)}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        aria-label={`Xem chi tiết ${user.displayName || user.id}`}
                                                        aria-expanded={
                                                            selected === user.id
                                                        }
                                                        aria-controls="admin-user-detail"
                                                        onClick={(event) => {
                                                            setDetailTrigger(
                                                                event.currentTarget,
                                                            );
                                                            setSelected(
                                                                user.id,
                                                            );
                                                        }}
                                                    >
                                                        Xem
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <nav
                            className="admin-users__pagination"
                            aria-label="Phân trang người dùng"
                        >
                            <button
                                type="button"
                                disabled={cursors.length === 1}
                                onClick={() => {
                                    setLoading(true);
                                    setCursors((items) => items.slice(0, -1));
                                }}
                            >
                                Trang trước
                            </button>
                            <span>Trang {cursors.length}</span>
                            <button
                                type="button"
                                disabled={!page.nextCursor}
                                onClick={() => {
                                    if (!page.nextCursor) return;
                                    setLoading(true);
                                    setCursors((items) => [
                                        ...items,
                                        page.nextCursor,
                                    ]);
                                }}
                            >
                                Trang sau
                            </button>
                        </nav>
                    </>
                )
            )}
            {selected && (
                <Dialog
                    title="Hồ sơ người dùng"
                    wide
                    className="admin-user-detail-dialog"
                    returnFocus={detailTrigger}
                    onClose={() => setSelected(null)}
                >
                    <UserDetail id={selected} />
                </Dialog>
            )}
        </section>
    );
}

function UserDetail({ id }: { id: string }) {
    const [detail, setDetail] = useState<AdminUserDetail | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        getAdminUser(id, controller.signal)
            .then(setDetail)
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) setError(message(cause));
            });
        return () => controller.abort();
    }, [id, attempt]);
    return (
        <section
            id="admin-user-detail"
            className="admin-users__detail"
            aria-labelledby="admin-user-detail-title"
        >
            <div className="admin-users__detail-heading">
                <h2 id="admin-user-detail-title">Hồ sơ người dùng</h2>
            </div>
            {error ? (
                <div role="alert">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setError("");
                            setAttempt((n) => n + 1);
                        }}
                    >
                        Thử lại
                    </button>
                </div>
            ) : !detail ? (
                <p role="status">Đang tải chi tiết…</p>
            ) : (
                <>
                    <dl className="admin-users__facts">
                        <div>
                            <dt>Tên hiển thị</dt>
                            <dd>
                                {detail.displayName || "Không có thông tin"}
                            </dd>
                        </div>
                        <div>
                            <dt>Mã tài khoản</dt>
                            <dd>{detail.id}</dd>
                        </div>
                        <div>
                            <dt>Email</dt>
                            <dd>
                                {detail.email || "Không có thông tin"} ·{" "}
                                {detail.emailVerified === 1
                                    ? "Đã xác nhận"
                                    : detail.emailVerified === 0
                                      ? "Chưa xác nhận"
                                      : "Không rõ trạng thái xác nhận"}
                            </dd>
                        </div>
                        <div>
                            <dt>Số điện thoại</dt>
                            <dd>
                                {detail.phone || "Không có thông tin"} ·{" "}
                                {detail.phoneVerified === 1
                                    ? "Đã xác nhận"
                                    : detail.phoneVerified === 0
                                      ? "Chưa xác nhận"
                                      : "Không rõ trạng thái xác nhận"}
                            </dd>
                        </div>
                        <div>
                            <dt>Vai trò</dt>
                            <dd>{roleLabel(detail.role)}</dd>
                        </div>
                        <div>
                            <dt>Trạng thái tài khoản</dt>
                            <dd>{statusLabel(detail.status)}</dd>
                        </div>
                        <div>
                            <dt>Trạng thái xác thực</dt>
                            <dd>{kycLabel(detail.kycStatus)}</dd>
                        </div>
                    </dl>
                    <h3>Lịch sử xác thực</h3>
                    <p>
                        Hồ sơ đang chờ duyệt hoặc đã xác thực còn được lưu có
                        thể mở để đối chiếu MSSV, họ tên, ảnh thẻ và ảnh chân
                        dung. Mỗi lần xem đều được ghi nhận; hồ sơ đã xóa không
                        thể khôi phục.
                    </p>
                    {detail.kycHistoryTruncated && (
                        <p>Chỉ hiển thị 50 hồ sơ gần nhất.</p>
                    )}
                    {detail.kycHistory.length === 0 ? (
                        <p>Không có hồ sơ xác thực được lưu.</p>
                    ) : (
                        <ol className="admin-users__history">
                            {detail.kycHistory.map((item) => (
                                <History key={item.id} item={item} />
                            ))}
                        </ol>
                    )}
                </>
            )}
        </section>
    );
}

function History({ item }: { item: KycHistoryItem }) {
    const [show, setShow] = useState(false);
    const [identity, setIdentity] = useState<KycReviewDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const canRequest =
        ["needs_review", "verified"].includes(item.status) &&
        item.purgedAt === null;

    async function toggle() {
        if (show) {
            setShow(false);
            return;
        }
        setShow(true);
        if (identity || loading) return;
        setLoading(true);
        setError("");
        try {
            setIdentity(await getKycReview(item.id));
        } catch (cause) {
            setError(message(cause));
        } finally {
            setLoading(false);
        }
    }

    return (
        <li>
            <div className="admin-users__history-heading">
                <strong>{statusLabel(item.status)}</strong>
                <span>Mã hồ sơ: {item.id}</span>
            </div>
            <dl className="admin-users__facts">
                <div>
                    <dt>Ngày gửi</dt>
                    <dd>{date(item.createdAt)}</dd>
                </div>
                <div>
                    <dt>Ngày duyệt</dt>
                    <dd>{date(item.reviewedAt)}</dd>
                </div>
                <div>
                    <dt>Ngày xóa dữ liệu</dt>
                    <dd>{date(item.purgedAt)}</dd>
                </div>
            </dl>
            {canRequest ? (
                <>
                    <button
                        type="button"
                        aria-expanded={show}
                        aria-controls={`kyc-identity-${item.id}`}
                        onClick={() => void toggle()}
                    >
                        {show ? "Ẩn dữ liệu KYC" : "Xem dữ liệu KYC"}
                    </button>
                    {show && (
                        <div id={`kyc-identity-${item.id}`}>
                            {loading && (
                                <p role="status">Đang tải dữ liệu KYC…</p>
                            )}
                            {error && <p role="alert">{error}</p>}
                            {identity && (
                                <>
                                    <dl className="admin-users__facts">
                                        <div>
                                            <dt>MSSV</dt>
                                            <dd>
                                                {identity.extracted.studentId}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt>Họ tên trên thẻ</dt>
                                            <dd>
                                                {identity.extracted.fullName ||
                                                    "Không đọc được"}
                                            </dd>
                                        </div>
                                    </dl>
                                    <div className="admin-users__assets">
                                        <Asset
                                            id={item.id}
                                            kind="card_front"
                                            label="Mặt trước thẻ sinh viên"
                                        />
                                        <Asset
                                            id={item.id}
                                            kind="selfie"
                                            label="Ảnh chân dung/khuôn mặt"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <p>Dữ liệu KYC không còn khả dụng từ hồ sơ này.</p>
            )}
        </li>
    );
}

function Asset({
    id,
    kind,
    label,
}: {
    id: string;
    kind: "card_front" | "selfie";
    label: string;
}) {
    const [failed, setFailed] = useState(false);
    return (
        <figure>
            <figcaption>{label}</figcaption>
            {failed ? (
                <p role="status">
                    Không tải được ảnh. Hồ sơ hoặc ảnh có thể không còn khả
                    dụng.
                </p>
            ) : (
                <>
                    {/* The protected endpoint is same-origin and intentionally loaded only on request. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={kycAssetUrl(encodeURIComponent(id), kind)}
                        alt={label}
                        onError={() => setFailed(true)}
                    />
                </>
            )}
        </figure>
    );
}
