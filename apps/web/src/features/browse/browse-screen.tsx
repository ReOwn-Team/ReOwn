"use client";
import { Button } from "@/components/primitives/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/primitives/toggle-group";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchX, SlidersHorizontal, X } from "lucide-react";
import { categories, money } from "@/mocks/data";
import { ProductGrid } from "@/features/products/components/product-card";
import { Dialog } from "@/components/ui/dialog";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useMock } from "@/mocks/store";

const groups = [
  { label: "Tất cả danh mục", value: "Tất cả", values: categories.slice(1) },
  {
    label: "Đồ điện tử",
    value: "Điện tử",
    values: ["Laptop", "Điện thoại", "Phụ kiện"],
  },
  { label: "Sách & học tập", value: "Sách", values: ["Sách"] },
  { label: "Nhà cửa & nội thất", value: "Đồ dùng", values: ["Đồ dùng"] },
  { label: "Sở thích & giải trí", value: "Sở thích", values: ["Sở thích"] },
];
const budgets = [
  { value: "", label: "Tất cả mức giá" },
  { value: "100000", label: "Dưới 100.000₫" },
  { value: "500000", label: "Đến 500.000₫" },
  { value: "1000000", label: "Đến 1.000.000₫" },
];
export function BrowseScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { catalog, viewed, ready } = useMock();
  const [open, setOpen] = useState(false);
  const query = (params.get("q") ?? "").trim();
  const rawCategory = params.get("category") ?? "Tất cả";
  const category =
    categories.includes(rawCategory) || rawCategory === "Điện tử"
      ? rawCategory
      : "Tất cả";
  const budget =
    /^\d+$/.test(params.get("budget") ?? "") && Number(params.get("budget")) > 0
      ? params.get("budget")!
      : "";
  const sort = params.get("sort") === "price" ? "price" : "new";
  const recentlyViewed = params.get("viewed") === "1";
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "Tất cả") next.set(key, value);
    else next.delete(key);
    router.replace(`/browse${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  const results = catalog.filter(
    (p) =>
      !p.sold &&
      (!recentlyViewed || viewed.includes(p.id)) &&
      (category === "Tất cả" ||
        (category === "Điện tử"
          ? groups[1].values.includes(p.category)
          : p.category === category)) &&
      (!budget || p.price <= Number(budget)) &&
      (!query ||
        `${p.name} ${p.category} ${p.seller}`
          .toLocaleLowerCase("vi")
          .includes(query.toLocaleLowerCase("vi"))),
  );
  if (sort === "price") results.sort((a, b) => a.price - b.price);
  else if (recentlyViewed)
    results.sort((a, b) => viewed.indexOf(a.id) - viewed.indexOf(b.id));
  const clear = () => router.replace("/browse", { scroll: false });
  const selectedGroup =
    category === "Tất cả"
      ? "Tất cả"
      : (groups.find((g) => g.value === category)?.value ??
        groups.find((g) => g.value !== "Tất cả" && g.values.includes(category))
          ?.value);
  const filterContent = (
    <>
      <div className="browse-filter-group" role="group" aria-label="Danh mục">
        <h3>Danh mục</h3>
        <ToggleGroup
          type="single"
          orientation="vertical"
          value={selectedGroup ?? "Tất cả"}
          onValueChange={(value) => {
            if (value) update("category", value);
          }}
          aria-label="Danh mục"
          className="browse-filter-options"
        >
          {groups.map((group) => (
            <ToggleGroupItem
              value={group.value}
              key={group.value}
              variant="outline"
            >
              {group.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="browse-filter-group" role="group" aria-label="Khoảng giá">
        <h3>Khoảng giá</h3>
        <ToggleGroup
          type="single"
          orientation="vertical"
          value={budget || "all"}
          onValueChange={(value) => {
            if (value) update("budget", value === "all" ? "" : value);
          }}
          aria-label="Khoảng giá"
          className="browse-filter-options"
        >
          {budgets.map((b) => (
            <ToggleGroupItem
              value={b.value || "all"}
              key={b.value}
              variant="outline"
            >
              {b.label}
            </ToggleGroupItem>
          ))}
          {budget && !budgets.some((b) => b.value === budget) && (
            <ToggleGroupItem value={budget} variant="outline">
              Tối đa {money(Number(budget))}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </div>
      <p className="small muted">
        Khu vực đang xem
        <br />
        <strong>TP. Hồ Chí Minh</strong>
      </p>
      <button type="button" className="browse-filter-button" onClick={clear}>
        Xóa bộ lọc
      </button>
    </>
  );
  if (!ready) return <LoadingScreen />;
  return (
    <div className="container page browse-page">
      <nav className="small muted" aria-label="Đường dẫn">
        <Link href="/">Trang chủ</Link> / Khám phá
      </nav>
      <div>
        <h1>{recentlyViewed ? "Đã xem gần đây" : "Tìm món đồ hợp với bạn."}</h1>
        <p className="muted">
          Đồ dùng còn tốt, mức giá dễ chịu. Khám phá những món đồ đang chờ chủ
          mới.
        </p>
      </div>
      <button
        type="button"
        className="button secondary mobile-filter-trigger"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={18} />
        Bộ lọc{(category !== "Tất cả" || budget) && " · Đang áp dụng"}
      </button>
      <div className="browse-layout">
        <aside className="browse-filters" aria-label="Bộ lọc sản phẩm">
          <h2>Bộ lọc</h2>
          {filterContent}
        </aside>
        <section className="browse-results" aria-label="Kết quả sản phẩm">
          <div className="browse-result-header">
            <h2 aria-live="polite">{results.length} sản phẩm</h2>
            <ToggleGroup
              type="single"
              value={sort}
              onValueChange={(value) => {
                if (value) update("sort", value);
              }}
              aria-label="Sắp xếp"
              className="browse-sort"
            >
              <ToggleGroupItem value="new">Mới nhất</ToggleGroupItem>
              <ToggleGroupItem value="price">Giá tăng dần</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="active-filters">
            {query && (
              <button
                className="browse-query"
                onClick={() => update("q", "")}
                aria-label={`Bỏ từ khóa ${query}`}
              >
                Tìm “{query}”<X size={14} />
              </button>
            )}
            {category !== "Tất cả" && (
              <button
                className="browse-query"
                onClick={() => update("category", "")}
                aria-label="Bỏ lọc danh mục"
              >
                {category}
                <X size={14} />
              </button>
            )}
            {budget && (
              <button
                className="browse-query"
                onClick={() => update("budget", "")}
                aria-label="Bỏ lọc ngân sách"
              >
                Tối đa {money(Number(budget))}
                <X size={14} />
              </button>
            )}
          </div>
          {results.length ? (
            <ProductGrid items={results} />
          ) : (
            <div className="empty-state">
              <SearchX size={36} aria-hidden="true" />
              <h2>
                {recentlyViewed && viewed.length === 0
                  ? "Bạn chưa xem sản phẩm nào"
                  : "Không tìm thấy sản phẩm phù hợp"}
              </h2>
              <p>Thử nới rộng ngân sách, đổi danh mục hoặc tìm từ khóa khác.</p>
              <button className="button secondary" onClick={clear}>
                Xóa bộ lọc
              </button>
            </div>
          )}
          <p className="small muted">
            * Mức thanh toán mỗi tháng là ước tính, chưa gồm phí (nếu có). Xem
            lịch thanh toán khi đặt hàng.
          </p>
          <p className="small muted">
            Bạn đã xem hết {results.length} sản phẩm phù hợp. Dữ liệu minh họa.
          </p>
        </section>
      </div>
      {open && (
        <Dialog
          title="Bộ lọc sản phẩm"
          onClose={() => setOpen(false)}
          className="filter-drawer"
          placement="right"
        >
          <div className="stack">
            <h2>Bộ lọc</h2>
            {filterContent}
            <div className="filter-drawer-footer">
              <Button onClick={() => setOpen(false)}>
                Xem {results.length} sản phẩm
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
