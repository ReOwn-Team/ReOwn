"use client";

import { useEffect, useRef, useState } from "react";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductGrid } from "@/features/products/components/product-card";
import type { Product } from "@/mocks/data";

export function NewProductsTrack({ items }: { items: Product[] }) {
    const track = useRef<HTMLDivElement>(null);
    const reduce = useShouldReduceMotion();
    const [edges, setEdges] = useState({ previous: false, next: false });

    useEffect(() => {
        const element = track.current;
        if (!element) return;
        const update = () => {
            const previous = element.scrollLeft > 2;
            const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
            setEdges((current) =>
                current.previous === previous && current.next === next
                    ? current
                    : { previous, next },
            );
        };
        const observer = new ResizeObserver(update);
        observer.observe(element);
        const grid = element.querySelector(".product-grid");
        if (grid) observer.observe(grid);
        element.addEventListener("scroll", update, { passive: true });
        update();
        return () => {
            observer.disconnect();
            element.removeEventListener("scroll", update);
        };
    }, [items]);

    function scroll(direction: number) {
        const element = track.current;
        element?.scrollBy({
            left: direction * element.clientWidth * 0.8,
            behavior: reduce ? "instant" : "smooth",
        });
    }

    return (
        <div className="home-new-carousel">
            <div ref={track} className="home-new-track" aria-label="Sản phẩm mới đăng">
                <ProductGrid items={items} />
            </div>
            {edges.previous && (
                <button type="button" className="home-new-arrow home-new-arrow-previous" aria-label="Sản phẩm mới trước đó" onClick={() => scroll(-1)}>
                    <ChevronLeft size={22} aria-hidden="true" />
                </button>
            )}
            {edges.next && (
                <button type="button" className="home-new-arrow home-new-arrow-next" aria-label="Sản phẩm mới tiếp theo" onClick={() => scroll(1)}>
                    <ChevronRight size={22} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
