"use client";

import { AnimatePresence, motion } from "motion/react";
import {
    useMotionTokens,
    useShouldReduceMotion,
} from "@animate-ui/react/utils/motion";
import { CheckCircle2, Menu, Info, RotateCcw, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMock } from "@/mocks/store";
import { useAuth } from "@/lib/auth/provider";
import { Dialog } from "@/components/ui/dialog";
import { MobileMenu } from "./mobile-menu";
import { FigmaIcon, type FigmaIconName } from "@/components/icons/figma-icon";

export { MobileNav } from "./mobile-navigation";

const navLinks: { href: string; label: string; icon: FigmaIconName }[] = [
    { href: "/browse?viewed=1", label: "Đã xem gần đây", icon: "viewed" },
    { href: "/browse?sort=new", label: "Sản phẩm mới đăng", icon: "clock" },
    {
        href: "/browse?budget=500000",
        label: "Tìm theo ngân sách",
        icon: "wallet",
    },
    { href: "/saved", label: "Sản phẩm đã lưu", icon: "saved" },
];
export function Header() {
    const pathname = usePathname();
    const params = useSearchParams();
    const router = useRouter();
    const { user, setAuthOpen, requireAuth } = useMock();
    const auth = useAuth();
    const visibleUser = user;
    const checkingSession = auth.status === "checking";
    const [query, setQuery] = useState<string | null>(null);
    const [menuTrigger, setMenuTrigger] = useState<HTMLElement | null>(null);
    function submitSearch(event: FormEvent) {
        event.preventDefault();
        const q = (query ?? params.get("q") ?? "").trim();
        router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
        setQuery(null);
    }
    return (
        <header className="site-header">
            <div className="container header-top">
                <button
                    className="header-menu-button"
                    type="button"
                    aria-label="Mở menu điều hướng"
                    aria-haspopup="dialog"
                    aria-expanded={Boolean(menuTrigger)}
                    onClick={(event) => setMenuTrigger(event.currentTarget)}
                >
                    <Menu aria-hidden="true" />
                </button>
                <Link
                    href="/"
                    className="logo-tile"
                    aria-label="ReOwn — trang chủ"
                >
                    <Image
                        src="/reown-logo.png"
                        alt="ReOwn"
                        width={144}
                        height={48}
                        priority
                    />
                </Link>
                <form
                    className="header-search"
                    role="search"
                    onSubmit={submitSearch}
                >
                    <input
                        type="search"
                        value={query ?? params.get("q") ?? ""}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Tìm kiếm sản phẩm"
                        aria-label="Tìm kiếm sản phẩm"
                    />
                    <button type="submit" aria-label="Tìm kiếm">
                        <FigmaIcon name="search" dark />
                    </button>
                </form>
                <div className="header-actions">
                    {checkingSession ? (
                        <button
                            className="header-account"
                            type="button"
                            disabled
                            aria-label="Đăng nhập / Đăng ký"
                            aria-busy="true"
                        >
                            <span className="account-icon">
                                <FigmaIcon name="user" />
                            </span>
                            <span>Đăng nhập / Đăng ký</span>
                        </button>
                    ) : visibleUser ? (
                        <Link
                            className="header-account"
                            href="/account"
                            aria-label={`Tài khoản ${visibleUser.name}`}
                        >
                            <span className="account-icon">
                                <FigmaIcon name="user" />
                            </span>
                            <span>{visibleUser.name}</span>
                        </Link>
                    ) : (
                        <button
                            className="header-account"
                            type="button"
                            aria-label="Đăng nhập / Đăng ký"
                            onClick={() =>
                                user
                                    ? router.push("/account")
                                    : setAuthOpen(true)
                            }
                        >
                            <span className="account-icon">
                                <FigmaIcon name="user" />
                            </span>
                            <span>Đăng nhập / Đăng ký</span>
                        </button>
                    )}
                    <Link
                        className="header-sell"
                        href="/sell"
                        aria-label="Đăng bán"
                        onNavigate={(event) => {
                            event.preventDefault();
                            requireAuth(() => router.push("/sell"));
                        }}
                    >
                        <FigmaIcon name="plus" />
                        <span className="header-sell-label">Đăng bán</span>
                    </Link>
                </div>
            </div>
            <nav className="header-nav" aria-label="Điều hướng chính">
                <ul className="container">
                    {navLinks.map((link) => (
                        <li key={link.label}>
                            <Link
                                href={link.href}
                                aria-current={
                                    pathname === link.href.split("?")[0] &&
                                    Array.from(
                                        new URLSearchParams(
                                            link.href.split("?")[1],
                                        ),
                                    ).every(
                                        ([key, value]) =>
                                            params.get(key) === value,
                                    )
                                        ? "page"
                                        : undefined
                                }
                            >
                                <FigmaIcon name={link.icon} />
                                {link.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
            {menuTrigger && (
                <MobileMenu
                    links={navLinks}
                    returnFocus={menuTrigger}
                    onClose={() => setMenuTrigger(null)}
                />
            )}
            <nav
                className="header-secondary"
                aria-label="Danh mục và thông tin ReOwn"
            >
                <div className="container header-secondary-inner">
                    <div className="header-category">
                        <Image
                            src="/figma/assets/nav-category.svg"
                            width={19}
                            height={19}
                            alt=""
                            aria-hidden="true"
                        />
                        <span>Danh mục sản phẩm</span>
                    </div>
                    <div className="header-community-links">
                        <Link
                            href="/team"
                            className="header-community-item"
                            aria-current={
                                pathname === "/team" ? "page" : undefined
                            }
                        >
                            <span className="header-community-icon team">
                                <Image
                                    src="/figma/assets/nav-team.svg"
                                    width={22}
                                    height={22}
                                    alt=""
                                    aria-hidden="true"
                                />
                            </span>
                            <span>Đội Ngũ ReOwn</span>
                        </Link>
                        <Link
                            href="/help?topic=partnership"
                            className="header-community-item"
                        >
                            <span className="header-community-icon partnership">
                                <Image
                                    src="/figma/assets/nav-partnership.svg"
                                    width={22}
                                    height={22}
                                    alt=""
                                    aria-hidden="true"
                                />
                            </span>
                            <span>Liên hệ hợp tác</span>
                        </Link>
                    </div>
                </div>
            </nav>
        </header>
    );
}
export function Footer() {
    const pathname = usePathname();
    const router = useRouter();
    const { resetDemo, persistenceError, requireAuth } = useMock();
    const [resetOpen, setResetOpen] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [resetError, setResetError] = useState("");
    const full =
        ["/", "/browse", "/saved", "/team"].includes(pathname) ||
        pathname.startsWith("/products/");
    return (
        <footer className={`site-footer ${full ? "footer-full" : ""}`}>
            <div className="container">
                {full && (
                    <div className="footer-cta">
                        <div>
                            <p className="eyebrow">
                                Một vòng đời mới bắt đầu từ bạn
                            </p>
                            <h2>
                                Món đồ bạn không dùng,
                                <br />
                                có thể là món ai đó đang tìm.
                            </h2>
                        </div>
                        <Link
                            className="button primary"
                            href="/sell"
                            onNavigate={(event) => {
                                event.preventDefault();
                                requireAuth(() => router.push("/sell"));
                            }}
                        >
                            Đăng bán món đồ →
                        </Link>
                    </div>
                )}
                <div className="footer-grid">
                    <div className="footer-brand">
                        <Image
                            className="footer-logo"
                            src="/logo.png"
                            alt="ReOwn"
                            width={180}
                            height={60}
                        />
                        <p>
                            Nơi sinh viên tìm đồ vừa túi tiền
                            <br />
                            và trao lại những món còn giá trị.
                        </p>
                        <span className="brand-line" />
                    </div>
                    <div>
                        <h2>Khám phá</h2>
                        <ul>
                            <li>
                                <Link href="/browse?sort=new">
                                    Sản phẩm mới đăng
                                </Link>
                            </li>
                            <li>
                                <Link href="/browse?budget=500000">
                                    Tìm theo ngân sách
                                </Link>
                            </li>
                            <li>
                                <Link href="/#collections-heading">
                                    Bộ sưu tập cho bạn
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h2>Mua bán cùng ReOwn</h2>
                        <ul>
                            <li>
                                <Link href="/help?topic=buy">
                                    Hướng dẫn mua hàng
                                </Link>
                            </li>
                            <li>
                                <Link href="/help?topic=sell">
                                    Hướng dẫn đăng bán
                                </Link>
                            </li>
                            <li>
                                <Link href="/help?topic=installments">
                                    Trả sau 3 kỳ
                                </Link>
                            </li>
                            <li>
                                <Link href="/help?topic=safety">
                                    An toàn giao dịch
                                </Link>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h2>Hỗ trợ</h2>
                        <ul>
                            <li>
                                <Link href="/help">Trung tâm trợ giúp</Link>
                            </li>
                            <li>
                                <Link href="/help?topic=report">
                                    Báo cáo vi phạm
                                </Link>
                            </li>
                            <li>
                                <Link href="/help?topic=contact">
                                    Liên hệ hỗ trợ
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="footer-legal">
                    <span>© 2026 ReOwn. Đồ cũ, giá trị mới.</span>
                    <div>
                        <Link href="/help?topic=terms">Điều khoản sử dụng</Link>
                        <Link href="/help?topic=privacy">
                            Chính sách bảo mật
                        </Link>
                    </div>
                </div>
                <div className="demo-toolbar">
                    <span>Dữ liệu minh họa · lưu trên thiết bị</span>
                    <button type="button" onClick={() => setResetOpen(true)}>
                        <RotateCcw size={13} aria-hidden="true" />
                        Đặt lại demo
                    </button>
                </div>
                {persistenceError && (
                    <p className="error" role="alert">
                        {persistenceError}
                    </p>
                )}
            </div>
            {resetOpen && (
                <Dialog
                    title="Đặt lại dữ liệu demo"
                    onClose={() => setResetOpen(false)}
                >
                    <div className="stack">
                        <h2>Trải nghiệm lại từ đầu?</h2>
                        <p>
                            Tin đăng, đơn hàng, ảnh và thay đổi trên thiết bị
                            này sẽ trở về dữ liệu mẫu. Phiên đăng nhập thật vẫn
                            được giữ.
                        </p>
                        {resetError && (
                            <p className="error" role="alert">
                                {resetError}
                            </p>
                        )}
                        <div className="action-row">
                            <button
                                className="button danger"
                                disabled={resetting}
                                onClick={async () => {
                                    setResetting(true);
                                    try {
                                        await resetDemo();
                                        router.push("/");
                                        setResetOpen(false);
                                    } catch {
                                        setResetError(
                                            "Chưa thể đặt lại. Hãy thử lại.",
                                        );
                                        setResetting(false);
                                    }
                                }}
                            >
                                Đặt lại dữ liệu
                            </button>
                            <button
                                className="button secondary"
                                onClick={() => setResetOpen(false)}
                            >
                                Giữ lại
                            </button>
                        </div>
                    </div>
                </Dialog>
            )}
        </footer>
    );
}
export function LiveRegion() {
    const { notice, savedToast, dismissSavedToast, undoSavedToast } = useMock();
    const reduce = useShouldReduceMotion();
    const { spring, transition, scale } = useMotionTokens();
    return (
        <>
            <div
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {savedToast
                    ? `Đã lưu ${savedToast.name} vào mục yêu thích.`
                    : notice}
            </div>
            <AnimatePresence initial={false}>
                {savedToast && (
                    <motion.section
                        key={savedToast.id}
                        className="saved-toast"
                        aria-label="Đã lưu sản phẩm"
                        initial={{
                            opacity: 0,
                            scale: reduce ? 1 : scale.toast,
                        }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            transition: spring.toast,
                        }}
                        exit={{
                            opacity: 0,
                            scale: reduce ? 1 : scale.toast,
                            transition: transition.dismiss,
                        }}
                    >
                        <Image
                            className="saved-toast__image"
                            src={savedToast.image}
                            unoptimized={savedToast.image.startsWith("/api/")}
                            alt=""
                            width={56}
                            height={56}
                        />
                        <div className="saved-toast__copy">
                            <strong title={savedToast.name}>
                                {savedToast.name}
                            </strong>
                            <span>Đã lưu vào mục yêu thích</span>
                            <button
                                type="button"
                                className="saved-toast__undo"
                                onClick={undoSavedToast}
                            >
                                Hoàn tác
                            </button>
                        </div>
                        <button
                            type="button"
                            className="saved-toast__dismiss"
                            aria-label={`Đóng thông báo lưu ${savedToast.name}`}
                            onClick={dismissSavedToast}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </motion.section>
                )}
            </AnimatePresence>
            <div
                className="notice-region"
                aria-hidden={notice ? undefined : true}
            >
                <AnimatePresence initial={false}>
                    {notice && (
                        <motion.div
                            key={notice}
                            className="live-region"
                            initial={{
                                opacity: 0,
                                scale: reduce ? 1 : scale.toast,
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                transition: spring.toast,
                            }}
                            exit={{
                                opacity: 0,
                                scale: reduce ? 1 : scale.toast,
                                transition: transition.dismiss,
                            }}
                        >
                            {notice.startsWith("Đã") ? (
                                <CheckCircle2 aria-hidden="true" />
                            ) : (
                                <Info aria-hidden="true" />
                            )}
                            <span>{notice}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
}
