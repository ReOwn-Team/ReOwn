"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  useMotionTokens,
  useShouldReduceMotion,
} from "@animate-ui/react/utils/motion";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { MapPin, Star, Images } from "lucide-react";
import "./product-card.css";

import { type Product, money } from "@/mocks/data";

export function ProductCard({
  product,
  preview = false,
  headingLevel = 3,
  imagePreview,
}: {
  product: Product;
  preview?: boolean;
  imagePreview?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const card = useRef<HTMLElement>(null);
  const present = useIsPresent();
  useEffect(() => {
    const element = card.current;
    if (!element) return;
    if (!present && element.contains(document.activeElement)) {
      const next = Array.from(
        element
          .closest(".product-grid")
          ?.querySelectorAll<HTMLAnchorElement>(
            ".product-card:not([inert]) .product-copy a",
          ) ?? [],
      ).find((link) => !element.contains(link));
      (next ?? document.querySelector<HTMLElement>("main"))?.focus({
        preventScroll: true,
      });
    }
    element.inert = !present;
  }, [present]);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const initials =
    product.seller
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(-2)
      .join("") || "R";
  const hasRating = /^\d([,.]\d)?/.test(product.rating);
  return (
    <article
      ref={card}
      className={preview ? "product-card product-card-preview" : "product-card"}
    >
      <div className="product-photo">
        {preview ? (
          (imagePreview ?? (
            <Image
              src={product.image}
              unoptimized={product.image.startsWith("/api/")}
              alt={product.name}
              width={600}
              height={400}
            />
          ))
        ) : (
          <Link
            href={`/products/${product.id}`}
            tabIndex={-1}
            aria-hidden="true"
          >
            <Image
              src={product.image}
              unoptimized={product.image.startsWith("/api/")}
              alt=""
              width={600}
              height={400}
            />
          </Link>
        )}
        <span className="product-condition">{product.condition}</span>
        {!preview && product.images && product.images.length > 1 && (
          <span className="product-photo-count">
            <Images aria-hidden="true" />
            {product.images.length}
          </span>
        )}
        {product.sold && <span className="badge sold-badge">Đã bán</span>}
      </div>
      <div className="product-copy">
        <Heading>
          {preview ? (
            product.name
          ) : (
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          )}
        </Heading>
        <strong className="product-price">{money(product.price)}</strong>
        <p className="product-installment">
          ≈{money(Math.floor(product.price / 3))}/tháng <span>3 kỳ*</span>
        </p>
        <div className="product-card-seller">
          <span className="product-card-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="product-card-seller-name" title={product.seller}>
            {product.seller}
          </span>
          <span
            className={
              hasRating ? "product-card-rating" : "product-card-unrated"
            }
          >
            {hasRating ? (
              <>
                <Star aria-hidden="true" />
                {product.rating}
              </>
            ) : (
              "Chưa đánh giá"
            )}
          </span>
        </div>
        <div className="product-card-meta product-meta">
          <span title={product.location}>
            <MapPin aria-hidden="true" />
            {product.location}
          </span>
          {!preview && <time>{product.posted}</time>}
        </div>
      </div>
    </article>
  );
}
export function ProductGrid({
  items,
  headingLevel = 3,
}: {
  items: Product[];
  headingLevel?: 2 | 3;
}) {
  const { transition, spring, scale } = useMotionTokens();
  const reduce = useShouldReduceMotion();
  return (
    <div className="product-grid">
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((product) => (
          <motion.div
            key={product.id}
            layout="position"
            initial={{ opacity: 0, scale: reduce ? 1 : scale.choice }}
            animate={{ opacity: 1, scale: 1, transition: transition.fade }}
            exit={{
              opacity: 0,
              scale: reduce ? 1 : scale.choice,
              transition: transition.popOut,
            }}
            transition={{ layout: reduce ? transition.instant : spring.reflow }}
          >
            <ProductCard product={product} headingLevel={headingLevel} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
