"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Home, Package, ShoppingBag, UserRound, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/button";
import { FigmaIcon, type FigmaIconName } from "@/components/icons/figma-icon";
import { useAuth } from "@/lib/auth/provider";
import { useMock } from "@/mocks/store";
import "./mobile-menu.css";

export function MobileMenu({
  links,
  returnFocus,
  onClose,
}: {
  links: { href: string; label: string; icon: FigmaIconName }[];
  returnFocus: HTMLElement;
  onClose: () => void;
}) {
  const router = useRouter();
  const auth = useAuth();
  const { user, setAuthOpen, requireAuth } = useMock();
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) onClose();
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [onClose]);
  return (
    <Dialog
      title="Menu điều hướng"
      className="mobile-menu-dialog"
      placement="left"
      returnFocus={returnFocus}
      onClose={onClose}
    >
      <h2>Menu</h2>
      <div className="mobile-menu-identity">
        <UserRound aria-hidden="true" />
        <div>
          <strong>{user?.name ?? "Chào bạn đến ReOwn"}</strong>
          <p className="small muted">Đồ cũ, giá trị mới.</p>
        </div>
      </div>
      {!user && (
        <Button
          disabled={auth.status === "checking"}
          onClick={() => {
            onClose();
            setAuthOpen(true);
          }}
        >
          Đăng nhập / Đăng ký
        </Button>
      )}
      <nav aria-label="Menu mobile">
        <ul className="mobile-menu-links">
          {[
            { href: "/browse", label: "Khám phá sản phẩm", Icon: Home },
            { href: "/account", label: "Tài khoản của tôi", Icon: UserRound },
            { href: "/orders", label: "Đơn mua", Icon: ShoppingBag },
            { href: "/listings", label: "Tin đăng của tôi", Icon: Package },
          ].map(({ href, label, Icon }) => (
            <li key={href}>
              <Link href={href} onClick={onClose}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mobile-menu-links mobile-menu-secondary">
          {links.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} onClick={onClose}>
                <FigmaIcon name={icon} dark />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Button
        onClick={() => {
          onClose();
          requireAuth(() => router.push("/sell"));
        }}
      >
        <Plus aria-hidden="true" data-icon="inline-start" /> Đăng bán món đồ
      </Button>
      <div className="mobile-menu-help">
        <Link href="/team" onClick={onClose}>
          Đội Ngũ ReOwn
        </Link>
        <Link href="/help?topic=partnership" onClick={onClose}>
          Liên hệ hợp tác
        </Link>
      </div>
    </Dialog>
  );
}
