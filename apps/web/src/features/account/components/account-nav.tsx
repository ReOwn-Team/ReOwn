"use client";

import {
    Highlight,
    HighlightItem,
} from "@animate-ui/react/primitives/effects/highlight";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { FigmaIcon, type FigmaIconName } from "@/components/icons/figma-icon";

export function AccountNav({
    active,
    onNavigate,
}: {
    active: string;
    onNavigate?: () => void;
}) {
    const links = [
        { href: "/account", text: "Tài khoản", icon: "account" },
        { href: "/orders", text: "Đơn mua", icon: "orders" },
        { href: "/account?tab=installments", text: "Trả sau", icon: "wallet" },
        { href: "/listings", text: "Tin đăng của tôi", icon: "listings" },
        { href: "/sales", text: "Đơn bán", icon: "sales" },
        {
            href: "/account?tab=addresses",
            text: "Địa chỉ nhận hàng",
            icon: "address",
        },
        {
            href: "/account?tab=security",
            text: "Mật khẩu & bảo mật",
            icon: "security",
        },
    ];
    return (
        <nav aria-label="Quản lý tài khoản">
            <Highlight
                mode="parent"
                controlledItems
                value={active}
                hover={false}
                click={false}
                containerClassName="account-nav"
                className="navigation-highlight-surface"
            >
                {links.map(({ href, text, icon }) => (
                    <HighlightItem key={href} value={text} asChild>
                        <Link
                            href={href}
                            onNavigate={onNavigate}
                            className={active === text ? "active" : ""}
                            aria-current={active === text ? "page" : undefined}
                        >
                            {icon === "wallet" ? (
                                <Wallet
                                    size={20}
                                    strokeWidth={1.5}
                                    color="var(--muted)"
                                    aria-hidden="true"
                                />
                            ) : (
                                <FigmaIcon name={icon as FigmaIconName} />
                            )}
                            <span>{text}</span>
                        </Link>
                    </HighlightItem>
                ))}
            </Highlight>
        </nav>
    );
}
