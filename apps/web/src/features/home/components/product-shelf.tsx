"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useShouldReduceMotion } from "@animate-ui/react/utils/motion";
import { Button } from "@/components/primitives/button";
import { ProductGrid } from "@/features/products/components/product-card";
import type { Product } from "@/mocks/data";

export function ProductShelf({ items }: { items: Product[] }) {
  const track = useRef<HTMLDivElement>(null);
  const reduce = useShouldReduceMotion();
  const [edges, setEdges] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    function update() {
      const previous = element!.scrollLeft > 2;
      const next =
        element!.scrollLeft + element!.clientWidth < element!.scrollWidth - 2;
      setEdges((current) =>
        current.previous === previous && current.next === next
          ? current
          : { previous, next },
      );
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [items]);
  if (!items.length) return null;
  function scroll(direction: number) {
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: reduce ? "instant" : "smooth",
    });
  }
  return (
    <section className="home-price-shelf" aria-labelledby="price-shelf-heading">
      <div className="section-heading">
        <div>
          <h2 id="price-shelf-heading">Dưới 500k, dễ chọn</h2>
          <p>Sách hay, đồ tiện, vừa túi tiền.</p>
        </div>
        <div className="home-shelf-controls">
          <Link className="home-section-link" href="/browse?budget=500000">
            Xem tất cả
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
          {(edges.previous || edges.next) && (
            <>
              <Button
                variant="outline"
                size="icon"
                aria-label="Sản phẩm trước"
                disabled={!edges.previous}
                onClick={() => scroll(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Sản phẩm tiếp theo"
                disabled={!edges.next}
                onClick={() => scroll(1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div ref={track} className="home-price-track">
        <ProductGrid items={items} />
      </div>
    </section>
  );
}
