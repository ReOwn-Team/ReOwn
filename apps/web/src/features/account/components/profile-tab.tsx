"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Mail, Phone, ShieldCheck } from "lucide-react";

import { useMock } from "@/mocks/store";

import { authSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/auth/errors";

export function ProfileTab({ onVerify }: { onVerify: () => void }) {
    const { user, notify } = useMock();
    const [name, setName] = useState(user!.name);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let active = true;
        authSession
            .getProfile()
            .then((profile) => {
                if (active) setName(profile.displayName);
            })
            .catch((error) => {
                if (active) setError(errorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    async function submit(e: FormEvent) {
        e.preventDefault();
        if (busy) return;
        if (!name.trim() || name.trim().length > 100) {
            setError("Nhập tên từ 1 đến 100 ký tự.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const profile = await authSession.updateProfile(name.trim());
            setName(profile.displayName);
            notify("Đã lưu thay đổi hồ sơ.");
        } catch (error) {
            setError(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }
    const verification = [
        {
            label: "Xác nhận email",
            value: user!.emailVerified === 1 ? "Đã xác nhận" : "Chưa xác nhận",
            icon: Mail,
        },
        {
            label: "Xác nhận SĐT",
            value: user!.phoneVerified === 1 ? "Đã xác nhận" : "Chưa xác nhận",
            icon: Phone,
        },
        {
            label: "Xác thực danh tính",
            value:
                [
                    "Chưa xác thực",
                    "Đang chờ duyệt",
                    "Đã xác thực",
                    "Chưa được duyệt",
                ][user!.kycStatus] ?? "Chưa xác thực",
            icon: ShieldCheck,
        },
    ];
    return (
        <div className="profile-panel">
            <header className="profile-identity">
                <span className="profile-avatar-image" aria-hidden="true">
                    {user!.name
                        .trim()
                        .split(/\s+/)
                        .map((part) => part[0])
                        .slice(-2)
                        .join("")}
                </span>
                <div className="profile-identity-copy">
                    <p>Hồ sơ của bạn</p>
                    <h2>{user!.name}</h2>
                    <div className="profile-identity-meta">
                        <span>
                            {user!.role === "user" ? "Mua và bán" : user!.role}
                        </span>
                        <span>
                            {user!.status === "active"
                                ? "Đang hoạt động"
                                : "Không hoạt động"}
                        </span>
                    </div>
                </div>
            </header>
            <div className="profile-sections">
                <form
                    className="profile-details"
                    onSubmit={submit}
                    aria-busy={busy || loading}
                >
                    <div className="profile-section-heading">
                        <h2>Thông tin cá nhân</h2>
                        <p>
                            Quản lý thông tin hiển thị trên tài khoản của bạn.
                        </p>
                    </div>
                    <div className="profile-fields">
                        <div className="field">
                            <label htmlFor="profile-name">Tên hiển thị</label>
                            <input
                                id="profile-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={100}
                                disabled={busy || loading}
                                required
                                aria-describedby={
                                    error ? "profile-error" : undefined
                                }
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="profile-email">Email</label>
                            <input
                                id="profile-email"
                                type="email"
                                value={user!.email}
                                readOnly
                                aria-describedby="profile-contact-hint"
                            />
                        </div>
                        <div className="field">
                            <label htmlFor="profile-phone">
                                Số điện thoại đăng nhập
                            </label>
                            <input
                                id="profile-phone"
                                type="tel"
                                value={user!.phone}
                                readOnly
                                aria-describedby="profile-contact-hint"
                            />
                        </div>
                    </div>
                    <p
                        className="profile-contact-hint"
                        id="profile-contact-hint"
                    >
                        Email và số điện thoại đăng nhập hiện chưa thể thay đổi.
                    </p>
                    {error && (
                        <p className="error" id="profile-error" role="alert">
                            {error}
                        </p>
                    )}
                    <div className="profile-save">
                        <button
                            className="button primary"
                            disabled={busy || loading}
                        >
                            {busy ? "Đang lưu…" : "Lưu thay đổi"}
                        </button>
                    </div>
                </form>
                <section
                    className="profile-verification"
                    aria-labelledby="profile-verification-title"
                >
                    <div className="profile-section-heading">
                        <h2 id="profile-verification-title">
                            Xác thực tài khoản
                        </h2>
                        <p>Thông tin xác nhận của bạn trên ReOwn.</p>
                    </div>
                    <dl className="profile-overview">
                        {verification.map(({ label, value, icon: Icon }) => (
                            <div
                                key={label}
                                className="profile-verification-item"
                            >
                                <Icon
                                    size={19}
                                    strokeWidth={1.6}
                                    aria-hidden="true"
                                />
                                <div>
                                    <dt>{label}</dt>
                                    <dd>{value}</dd>
                                    {label === "Xác thực danh tính" && (
                                        <button
                                            className="profile-verify"
                                            type="button"
                                            onClick={onVerify}
                                        >
                                            Xác thực bằng thẻ sinh viên{" "}
                                            <ArrowUpRight
                                                size={15}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
        </div>
    );
}
