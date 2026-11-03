"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, PlusCircle, Search, UserRound } from "lucide-react";
import {
    Highlight,
    HighlightItem,
} from "@animate-ui/react/primitives/effects/highlight";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/provider";
import { useMock } from "@/mocks/store";
import { cn } from "@/lib/utils";
import "./mobile-navigation.css";

const glassShadow =
    "shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(25,28,33,0.02),0px_0px_0px_1px_rgba(25,28,33,0.08)]";

function MobileSearch({
    trigger,
    onClose,
}: {
    trigger: HTMLElement;
    onClose: () => void;
}) {
    const params = useSearchParams();
    const router = useRouter();
    const [query, setQuery] = useState(params.get("q") ?? "");
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        input.current?.focus();
    }, []);
    function submit(event: FormEvent) {
        event.preventDefault();
        const value = query.trim();
        onClose();
        router.push(
            value ? `/browse?q=${encodeURIComponent(value)}` : "/browse",
        );
    }
    return (
        <Dialog
            title="Tìm kiếm sản phẩm"
            className="mobile-search-dialog"
            returnFocus={trigger}
            onClose={onClose}
        >
            <h2>Tìm món đồ bạn cần</h2>
            <form
                className="mobile-search-form"
                role="search"
                onSubmit={submit}
            >
                <input
                    ref={input}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Tìm kiếm sản phẩm"
                    placeholder="Bạn đang tìm món đồ gì?"
                />
                <button type="submit" aria-label="Tìm kiếm">
                    <Search aria-hidden="true" />
                </button>
            </form>
            <div
                className="mobile-search-suggestions"
                aria-label="Gợi ý tìm kiếm"
            >
                {["Laptop", "Điện thoại", "Sách"].map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => {
                            setQuery(value);
                            input.current?.focus();
                        }}
                    >
                        {value}
                    </button>
                ))}
            </div>
        </Dialog>
    );
}

export function MobileNav() {
    const path = usePathname();
    const router = useRouter();
    const auth = useAuth();
    const { requireAuth, user, setAuthOpen } = useMock();
    const [searchTrigger, setSearchTrigger] = useState<HTMLElement | null>(
        null,
    );
    if (path === "/checkout") return null;
    const active =
        path === "/sell"
            ? "/sell"
            : ["/account", "/orders", "/listings", "/sales"].some((prefix) =>
                    path.startsWith(prefix),
                )
              ? "/account"
              : path === "/browse" || path === "/"
                ? "/browse"
                : "";
    return (
        <>
            <nav
                className="mobile-nav mobile-glass-nav"
                aria-label="Điều hướng mobile"
            >
                <Highlight
                    mode="parent"
                    controlledItems
                    value={active}
                    hover={false}
                    click={false}
                    containerClassName={cn(
                        "mobile-nav-items mobile-glass-tabs",
                        glassShadow,
                    )}
                    className="mobile-glass-highlight"
                >
                    <HighlightItem value="/browse" asChild>
                        <Link
                            className="mobile-tab"
                            href="/browse"
                            aria-current={
                                path === "/browse" ? "page" : undefined
                            }
                        >
                            <Home aria-hidden="true" />
                            <span>Khám phá</span>
                        </Link>
                    </HighlightItem>
                    <HighlightItem value="/sell" asChild>
                        <Link
                            className="mobile-tab"
                            href="/sell"
                            aria-current={
                                active === "/sell" ? "page" : undefined
                            }
                            onNavigate={(event) => {
                                event.preventDefault();
                                requireAuth(() => router.push("/sell"));
                            }}
                        >
                            <PlusCircle aria-hidden="true" />
                            <span>Đăng bán</span>
                        </Link>
                    </HighlightItem>
                    <HighlightItem value="/account" asChild>
                        {user && auth.status !== "checking" ? (
                            <Link
                                className="mobile-tab"
                                href="/account"
                                aria-label={`Tài khoản ${user.name}`}
                                aria-current={
                                    path === "/account" ? "page" : undefined
                                }
                            >
                                <UserRound aria-hidden="true" />
                                <span>Tài khoản</span>
                            </Link>
                        ) : (
                            <button
                                className="mobile-tab"
                                type="button"
                                aria-label="Đăng nhập / Đăng ký"
                                disabled={auth.status === "checking"}
                                aria-busy={auth.status === "checking"}
                                onClick={() => setAuthOpen(true)}
                            >
                                <UserRound aria-hidden="true" />
                                <span>Tài khoản</span>
                            </button>
                        )}
                    </HighlightItem>
                </Highlight>
                <button
                    className={cn("mobile-glass-search", glassShadow)}
                    type="button"
                    aria-label="Mở tìm kiếm"
                    aria-haspopup="dialog"
                    aria-expanded={Boolean(searchTrigger)}
                    onClick={(event) => setSearchTrigger(event.currentTarget)}
                >
                    <Search aria-hidden="true" />
                </button>
            </nav>
            {searchTrigger && (
                <MobileSearch
                    trigger={searchTrigger}
                    onClose={() => setSearchTrigger(null)}
                />
            )}
        </>
    );
}
