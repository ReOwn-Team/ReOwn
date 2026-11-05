"use client";

import {
    ToggleGroup,
    ToggleGroupItem,
} from "@/components/primitives/toggle-group";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { categories, money } from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { FigmaIcon, type FigmaIconName } from "@/components/icons/figma-icon";
import { ProductGrid } from "@/features/products/components/product-card";
import { HackathonStrip } from "./components/hackathon-strip";
import { ProductShelf } from "./components/product-shelf";
import { NewProductsTrack } from "./components/new-products-track";

const categoryLinks: {
    label: string;
    category: string;
    icon: FigmaIconName;
}[] = [
    { label: "Laptop", category: "Laptop", icon: "laptop" },
    { label: "Điện thoại", category: "Điện thoại", icon: "phone" },
    { label: "Phụ kiện", category: "Phụ kiện", icon: "headphones" },
    { label: "Sách & giáo trình", category: "Sách", icon: "books" },
    { label: "Đồ dùng phòng trọ", category: "Đồ dùng", icon: "home" },
    { label: "Sở thích & giải trí", category: "Sở thích", icon: "camera" },
];
const collections = [
    {
        title: "Vừa chuyển trọ",
        description: "Những món cần cho chỗ ở mới.",
        category: "Đồ dùng",
        image: "/figma/chair.png",
    },
    {
        title: "Cho kỳ học mới",
        description: "Sách, laptop và phụ kiện học tập.",
        category: "Sách",
        image: "/figma/books.png",
    },
    {
        title: "Bắt đầu một sở thích",
        description: "Thử điều mới, từ những món đã qua sử dụng.",
        category: "Sở thích",
        image: "/figma/camera.png",
    },
];

export function HomeScreen() {
    const router = useRouter();
    const { catalog } = useMock();
    const products = catalog.filter((item) => !item.sold);
    const featured = products.find((item) => item.category === "Laptop");
    const budgetPicks = products
        .filter((item) => item.price <= 500000)
        .sort((a, b) => a.price - b.price)
        .slice(0, 6);
    const [category, setCategory] = useState("Tất cả");
    const [budget, setBudget] = useState("500000");
    const [need, setNeed] = useState("Tất cả");
    const [budgetError, setBudgetError] = useState("");
    const value = Number(budget.replace(/\D/g, ""));
    const visible =
        category === "Tất cả"
            ? products
            : products.filter((p) => p.category === category);
    const suggestions = products
        .filter(
            (p) =>
                p.price <= value && (need === "Tất cả" || p.category === need),
        )
        .slice(0, 3);

    function submitBudget(event: FormEvent) {
        event.preventDefault();
        if (!value || value <= 0) {
            setBudgetError("Nhập ngân sách lớn hơn 0 để xem gợi ý.");
            return;
        }
        setBudgetError("");
        const params = new URLSearchParams({ budget: String(value) });
        if (need !== "Tất cả") params.set("category", need);
        router.push(`/browse?${params}`);
    }

    return (
        <div className="container page home-page">
            <section className="home-hero" aria-labelledby="hero-heading">
                <aside
                    className="home-categories"
                    aria-label="Danh mục nổi bật"
                >
                    <ul className="home-category-links">
                        {categoryLinks.map(
                            ({ label, category: value, icon }) => (
                                <li key={value}>
                                    <Link
                                        href={`/browse?category=${encodeURIComponent(value)}`}
                                    >
                                        <span className="home-category-icon">
                                            <FigmaIcon name={icon} dark />
                                        </span>
                                        <span className="home-category-label">
                                            {label}
                                        </span>
                                        <span className="home-category-short-label">
                                            {(
                                                {
                                                    Sách: "Sách",
                                                    "Đồ dùng": "Phòng trọ",
                                                    "Sở thích": "Giải trí",
                                                } as Record<string, string>
                                            )[value] ?? label}
                                        </span>
                                    </Link>
                                </li>
                            ),
                        )}
                    </ul>
                </aside>
                <div className="home-banner">
                    <div className="home-banner-copy">
                        <p className="home-banner-label">
                            Sẵn sàng cho kỳ học mới
                        </p>
                        <h1 id="hero-heading">
                            Đồ bạn cần.
                            <br />
                            Giá bạn thích.
                        </h1>
                        <p>
                            Laptop, sách và phụ kiện
                            <br />
                            cho một kỳ học sẵn sàng.
                        </p>
                        <Link href="/browse?category=Laptop">
                            Khám phá ngay{" "}
                            <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    </div>
                    <Link
                        className="home-banner-image"
                        href={
                            featured
                                ? `/products/${featured.id}`
                                : "/browse?category=Laptop"
                        }
                    >
                        <Image
                            src={featured?.image ?? "/figma/laptop.png"}
                            alt={featured ? "" : "Laptop học tập trên bàn"}
                            unoptimized={featured?.live}
                            width={600}
                            height={400}
                            priority
                        />
                        {featured && (
                            <span className="home-banner-price">
                                <small>Món đồ cho góc học tập</small>
                                <strong>{featured.name}</strong>
                                <b>{money(featured.price)}</b>
                            </span>
                        )}
                    </Link>
                </div>
                <div className="home-shortcuts">
                    <Link
                        href="/browse?budget=500000"
                        className="home-shortcut budget-shortcut"
                    >
                        <span>
                            <small className="eyebrow">Nhỏ mà có võ</small>
                            <strong>Dưới 500k</strong>
                            <small>
                                Tìm món vừa túi{" "}
                                <ArrowRight size={13} aria-hidden="true" />
                            </small>
                        </span>
                        <Image
                            src="/figma/books.png"
                            alt=""
                            width={80}
                            height={104}
                        />
                    </Link>
                    <Link
                        href="/browse?category=%C4%90%E1%BB%93%20d%C3%B9ng"
                        className="home-shortcut study-shortcut"
                    >
                        <span>
                            <small className="eyebrow">Thêm cảm hứng</small>
                            <strong>Góc học tập</strong>
                            <small>
                                Khám phá ngay{" "}
                                <ArrowRight size={13} aria-hidden="true" />
                            </small>
                        </span>
                        <Image
                            src="/figma/chair.png"
                            alt=""
                            width={80}
                            height={104}
                        />
                    </Link>
                </div>
            </section>
            <section
                aria-labelledby="new-heading"
                className="stack home-marketplace-section home-discovery"
            >
                <div className="section-heading">
                    <h2 id="new-heading">Mới đăng</h2>
                    <Link className="home-section-link" href="/browse?sort=new">
                        Xem tất cả <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>
                <div className="home-filters">
                    <ToggleGroup
                        type="single"
                        value={category}
                        onValueChange={(value) => {
                            if (value) setCategory(value);
                        }}
                        aria-label="Lọc theo danh mục"
                        className="chip-row home-category-options"
                    >
                        {categories.map((name) => (
                            <ToggleGroupItem value={name} key={name}>
                                {name}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>

                    <Link href="/browse" className="chip">
                        <SlidersHorizontal size={15} aria-hidden="true" /> Bộ
                        lọc
                    </Link>
                </div>
                <NewProductsTrack key={category} items={visible} />
                <p className="small muted home-footnote">
                    * Mức thanh toán mỗi tháng là ước tính từ giá sản phẩm, chưa
                    gồm phí (nếu có). Lịch thanh toán chi tiết được hiển thị khi
                    đặt hàng.
                </p>
            </section>
            {products.length > 0 && (
                <section
                    aria-labelledby="explore-heading"
                    className="stack home-marketplace-section home-explore"
                >
                    <div className="section-heading">
                        <h2 id="explore-heading">Khám phá sản phẩm</h2>
                        <Link className="home-section-link" href="/browse">
                            Xem tất cả{" "}
                            <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                    </div>
                    <ProductGrid items={products.slice(0, 12)} />
                </section>
            )}
            <ProductShelf items={budgetPicks} />
            <section className="home-budget" aria-labelledby="budget-heading">
                <div className="home-budget-top">
                    <div>
                        <p className="eyebrow">Mua sắm vừa túi tiền</p>
                        <h2 id="budget-heading">
                            Ngân sách này,
                            <br />
                            mua được gì?
                        </h2>
                        <p className="small muted">
                            Chọn mức chi. Tìm món đồ phù hợp với bạn.
                        </p>
                    </div>
                    <form
                        className="budget-form"
                        onSubmit={submitBudget}
                        noValidate
                    >
                        <div className="field">
                            <label htmlFor="budget-input">
                                Ngân sách tối đa (đ)
                            </label>
                            <input
                                id="budget-input"
                                inputMode="numeric"
                                value={budget}
                                onChange={(event) => {
                                    setBudget(event.target.value);
                                    setBudgetError("");
                                }}
                                aria-invalid={budgetError ? "true" : undefined}
                                aria-describedby={
                                    budgetError ? "budget-error" : undefined
                                }
                            />
                            {budgetError && (
                                <p
                                    className="error"
                                    id="budget-error"
                                    role="alert"
                                >
                                    {budgetError}
                                </p>
                            )}
                        </div>
                        <div className="field">
                            <label htmlFor="budget-need">
                                Bạn đang cần gì?
                            </label>
                            <select
                                id="budget-need"
                                value={need}
                                onChange={(event) =>
                                    setNeed(event.target.value)
                                }
                            >
                                <option value="Tất cả">Tất cả nhu cầu</option>
                                {categories.slice(1).map((item) => (
                                    <option key={item}>{item}</option>
                                ))}
                            </select>
                        </div>
                        <button className="button primary" type="submit">
                            Tìm đồ phù hợp
                        </button>
                        <div
                            className="budget-presets"
                            aria-label="Mức ngân sách gợi ý"
                        >
                            {[200000, 500000, 1000000].map((amount) => (
                                <button
                                    key={amount}
                                    type="button"
                                    className="chip"
                                    aria-pressed={value === amount}
                                    onClick={() => {
                                        setBudget(String(amount));
                                        setBudgetError("");
                                    }}
                                >
                                    Dưới{" "}
                                    {amount === 1000000
                                        ? "1 triệu"
                                        : `${amount / 1000}k`}
                                </button>
                            ))}
                        </div>
                    </form>
                </div>
                <div className="section-heading">
                    <h3>Một vài món trong tầm {money(value || 0)}</h3>
                    <button
                        className="home-section-link"
                        type="button"
                        onClick={() => {
                            if (value > 0)
                                router.push(
                                    `/browse?budget=${value}${need === "Tất cả" ? "" : `&category=${encodeURIComponent(need)}`}`,
                                );
                        }}
                    >
                        Xem tất cả sản phẩm phù hợp{" "}
                        <ArrowRight size={14} aria-hidden="true" />
                    </button>
                </div>
                {suggestions.length ? (
                    <div className="budget-results">
                        {suggestions.map((product) => (
                            <Link
                                className="budget-result"
                                key={product.id}
                                href={`/products/${product.id}`}
                            >
                                <Image
                                    src={product.image}
                                    unoptimized={product.live}
                                    alt=""
                                    width={100}
                                    height={120}
                                />
                                <span>
                                    <strong>{product.name}</strong>
                                    <b>{money(product.price)}</b>
                                    <small>{product.condition}</small>
                                    <span className="budget-result-link">
                                        Xem món này
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <p className="small muted">
                        Chưa có sản phẩm phù hợp. Hãy thử tăng ngân sách hoặc
                        đổi nhu cầu.
                    </p>
                )}
            </section>{" "}
            <section aria-labelledby="collections-heading" className="stack">
                <div className="section-heading">
                    <h2 id="collections-heading">
                        Bạn đang cần gì?{" "}
                        <span className="muted">Bắt đầu từ đây.</span>
                    </h2>
                    <Link className="home-section-link" href="/browse">
                        Xem bộ sưu tập{" "}
                        <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                </div>
                <div className="collection-grid">
                    {collections.map((item) => (
                        <Link
                            key={item.title}
                            className="collection-card"
                            href={`/browse?category=${encodeURIComponent(item.category)}`}
                        >
                            <Image
                                src={item.image}
                                alt=""
                                width={600}
                                height={400}
                            />
                            <span className="collection-copy">
                                <span>
                                    <strong>{item.title}</strong>
                                    <small>{item.description}</small>
                                </span>
                                <ArrowRight size={18} aria-hidden="true" />
                            </span>
                        </Link>
                    ))}
                </div>
            </section>
            <HackathonStrip />
        </div>
    );
}
