"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    ArrowLeft,
    ChartNoAxesCombined,
    ClipboardCheck,
    LayoutDashboard,
    Menu,
    ShieldCheck,
    UsersRound,
    X,
} from "lucide-react";
import { useAuth } from "@/lib/auth/provider";
import { useMock } from "@/mocks/store";

const links = [
    { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
    { href: "/admin/products", label: "Duyệt sản phẩm", icon: ClipboardCheck },
    { href: "/admin/kyc", label: "Xác thực sinh viên", icon: ShieldCheck },
    { href: "/admin/users", label: "Người dùng", icon: UsersRound },
];

export function AdminShell({ children }: { children: ReactNode }) {
    const auth = useAuth();
    const { setAuthOpen } = useMock();
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const currentSection =
        links.find((link) => link.href === pathname)?.label ?? "Quản trị";
    if (auth.status === "checking")
        return (
            <div className="admin-gate" role="status">
                Đang kiểm tra phiên đăng nhập…
            </div>
        );
    if (!auth.user || auth.user.role !== "admin")
        return (
            <div className="admin-gate">
                <ShieldCheck size={32} aria-hidden="true" />
                <h1>
                    {auth.user
                        ? "Không có quyền truy cập"
                        : "Đăng nhập để tiếp tục"}
                </h1>
                <p>
                    {auth.user
                        ? "Khu vực này chỉ dành cho quản trị viên ReOwn."
                        : "Sử dụng tài khoản quản trị viên của bạn."}
                </p>
                {!auth.user && (
                    <button
                        className="button primary"
                        onClick={() => setAuthOpen(true)}
                    >
                        Đăng nhập
                    </button>
                )}
                <Link href="/">Về trang ReOwn</Link>
            </div>
        );
    return (
        <div className="admin-shell">
            <button
                type="button"
                className="admin-menu-backdrop"
                aria-label="Đóng điều hướng quản trị"
                tabIndex={menuOpen ? 0 : -1}
                onClick={() => setMenuOpen(false)}
            />
            <aside className="admin-sidebar" data-open={menuOpen || undefined}>
                <div className="admin-sidebar-brand-row">
                    <Link
                        href="/admin"
                        className="admin-brand"
                        aria-label="ReOwn quản trị - Tổng quan"
                        onClick={() => setMenuOpen(false)}
                    >
                        <Image
                            src="/logo.png"
                            alt="ReOwn"
                            width={112}
                            height={38}
                        />
                        <span>Quản trị</span>
                    </Link>
                    <button
                        type="button"
                        className="admin-sidebar-close"
                        aria-label="Đóng điều hướng"
                        onClick={() => setMenuOpen(false)}
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>
                <p className="admin-nav-label">Không gian làm việc</p>
                <nav
                    id="admin-navigation"
                    aria-label="Điều hướng quản trị"
                    className="admin-nav"
                >
                    {links.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-current={
                                pathname === href ? "page" : undefined
                            }
                            onClick={() => setMenuOpen(false)}
                        >
                            <Icon size={19} aria-hidden="true" />
                            <span>{label}</span>
                        </Link>
                    ))}
                </nav>
                <div className="admin-sidebar-bottom">
                    <div className="admin-identity">
                        <span className="admin-avatar">
                            {auth.user.displayName
                                .trim()
                                .charAt(0)
                                .toUpperCase() || "A"}
                        </span>
                        <span>
                            <strong>{auth.user.displayName}</strong>
                            <small>Quản trị viên</small>
                        </span>
                    </div>
                    <Link href="/" className="admin-back">
                        <ArrowLeft size={16} aria-hidden="true" /> Về trang
                        ReOwn
                    </Link>
                </div>
            </aside>
            <div className="admin-workspace">
                <header className="admin-topbar">
                    <button
                        type="button"
                        className="admin-menu-toggle"
                        aria-label="Mở điều hướng quản trị"
                        aria-expanded={menuOpen}
                        aria-controls="admin-navigation"
                        onClick={() => setMenuOpen(true)}
                    >
                        <Menu size={20} aria-hidden="true" />
                    </button>
                    <span>
                        <ChartNoAxesCombined size={17} aria-hidden="true" />{" "}
                        Trung tâm quản trị
                    </span>
                    <span className="admin-breadcrumb">
                        ReOwn <span aria-hidden="true">/</span> {currentSection}
                    </span>
                    <span className="admin-mobile-section">
                        {currentSection}
                    </span>
                </header>
                <div className="admin-content">{children}</div>
            </div>
        </div>
    );
}
