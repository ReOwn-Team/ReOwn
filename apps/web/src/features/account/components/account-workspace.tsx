"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    ChevronDown,
    LogOut,
    Menu,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import { authSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/auth/errors";
import { useMock } from "@/mocks/store";
import { useAuth } from "@/lib/auth/provider";
import { AccountNav } from "@/features/account/components/account-nav";
import "@/features/account/components/account-workspace.css";

export function AccountWorkspace({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const params = useSearchParams();
    const { user } = useAuth();
    const router = useRouter();
    const { notify } = useMock();
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const menu = useRef<HTMLDetailsElement>(null);
    async function logout() {
        if (loggingOut) return;
        setLoggingOut(true);
        setLogoutError("");
        try {
            await authSession.logout();
            notify("Đã đăng xuất.");
            if (menu.current) menu.current.open = false;
            router.replace("/account");
        } catch (error) {
            setLogoutError(errorMessage(error));
        } finally {
            setLoggingOut(false);
        }
    }
    const actions = user && (
        <div className="account-sidebar-actions">
            {user.role === "admin" && (
                <Link href="/admin">
                    <ShieldCheck size={18} aria-hidden="true" /> Mở trang quản
                    trị
                </Link>
            )}
            <button type="button" disabled={loggingOut} onClick={logout}>
                <LogOut size={18} aria-hidden="true" />{" "}
                {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
            {logoutError && (
                <p className="error" role="alert">
                    {logoutError}
                </p>
            )}
        </div>
    );
    const active = pathname.startsWith("/orders")
        ? "Đơn mua"
        : pathname === "/sales"
          ? "Đơn bán"
          : pathname === "/listings" || pathname === "/sell"
            ? "Tin đăng của tôi"
            : params.get("tab") === "addresses"
              ? "Địa chỉ nhận hàng"
              : params.get("tab") === "security"
                ? "Mật khẩu & bảo mật"
                : "Tài khoản";

    return (
        <div className="container account-workspace">
            <aside
                className="account-sidebar"
                aria-label="Thông tin và điều hướng tài khoản"
            >
                <div className="account-identity">
                    <span className="account-identity-avatar">
                        <UserRound size={22} aria-hidden="true" />
                    </span>
                    <div>
                        <span className="small muted">Tài khoản ReOwn</span>
                        <strong>
                            {user?.displayName ?? "Tài khoản của tôi"}
                        </strong>
                    </div>
                </div>
                <AccountNav active={active} />
                {actions}
            </aside>
            <details className="account-mobile-menu" ref={menu}>
                <summary>
                    <Menu size={18} aria-hidden="true" />
                    <span>
                        <small>Menu tài khoản</small>
                        <strong>{active}</strong>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <AccountNav
                    active={active}
                    onNavigate={() => {
                        if (menu.current) {
                            menu.current.open = false;
                            menu.current.querySelector("summary")?.focus();
                        }
                    }}
                />
                {actions}
            </details>
            <div className="account-workspace-content">{children}</div>
        </div>
    );
}
