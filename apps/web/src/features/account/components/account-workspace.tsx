"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Menu, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth/provider";
import { AccountNav } from "@/features/account/components/account-nav";
import "@/features/account/components/account-workspace.css";

export function AccountWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const menu = useRef<HTMLDetailsElement>(null);
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
            <strong>{user?.displayName ?? "Tài khoản của tôi"}</strong>
          </div>
        </div>
        <AccountNav active={active} />
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
      </details>
      <div className="account-workspace-content">{children}</div>
    </div>
  );
}
