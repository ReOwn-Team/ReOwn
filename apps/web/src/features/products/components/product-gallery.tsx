"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Images,
  ImageOff,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import type { Product } from "@/mocks/data";

export function ProductGallery({ product }: { product: Product }) {
  const photos = [
    ...new Set(
      (product.images?.length ? product.images : [product.image]).filter(
        Boolean,
      ),
    ),
  ];
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(false);
  const active = Math.min(selected, photos.length - 1);
  const count = photos.length;
  function move(direction: number) {
    setSelected((current) => (current + direction + count) % count);
  }
  function galleryKeys(event: KeyboardEvent<HTMLElement>) {
    if (
      zoom ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      count < 2 ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    move(event.key === "ArrowLeft" ? -1 : 1);
  }
  useEffect(() => {
    if (!zoom || count < 2) return;
    function keyboard(event: globalThis.KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      setSelected((current) => (current + direction + count) % count);
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [zoom, count]);
  if (!count)
    return (
      <div className="product-gallery-empty">
        <ImageOff aria-hidden="true" />
        <p>Chưa có ảnh sản phẩm</p>
      </div>
    );
  return (
    <section
      className="product-media"
      aria-label="Bộ ảnh sản phẩm"
      onKeyDown={galleryKeys}
    >
      <div className="product-gallery">
        <button
          className="product-gallery-opener"
          type="button"
          aria-label="Phóng to ảnh sản phẩm"
          onClick={() => setZoom(true)}
        >
          <Image
            src={photos[active]}
            unoptimized={product.live}
            alt={`${product.name} — ảnh ${active + 1}`}
            width={800}
            height={800}
            priority
          />
          <span className="product-gallery-expand">
            <Expand aria-hidden="true" />
            Phóng to
          </span>
        </button>
        <span className="product-gallery-count" aria-hidden="true">
          <Images />
          {active + 1} / {count}
        </span>
        {count > 1 && (
          <>
            <button
              className="icon-button product-gallery-prev"
              type="button"
              aria-label="Ảnh trước"
              onClick={() => move(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              className="icon-button product-gallery-next"
              type="button"
              aria-label="Ảnh tiếp theo"
              onClick={() => move(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div
          className="product-thumbnails"
          role="group"
          aria-label="Chọn ảnh sản phẩm"
        >
          {photos.map((url, index) => (
            <button
              type="button"
              key={url}
              aria-label={`Xem ảnh ${index + 1}`}
              aria-pressed={active === index}
              onClick={() => setSelected(index)}
            >
              <Image
                src={url}
                unoptimized={product.live}
                alt=""
                width={76}
                height={64}
              />
            </button>
          ))}
        </div>
      )}
      <p className="product-photo-caption">
        <Images aria-hidden="true" />
        {product.live ? "Ảnh từ tin đăng" : "Ảnh minh họa sản phẩm"}
        <span>{count} ảnh</span>
      </p>
      {zoom && (
        <Dialog
          title="Ảnh sản phẩm"
          className="product-zoom-dialog"
          onClose={() => setZoom(false)}
          wide
        >
          <div className="product-zoom-heading">
            <h2>Ảnh sản phẩm</h2>
            <span>
              {active + 1} / {count}
            </span>
          </div>
          <Image
            className="zoom-image"
            src={photos[active]}
            unoptimized={product.live}
            alt={`${product.name} — ảnh ${active + 1}`}
            width={1200}
            height={900}
          />
          {count > 1 && (
            <div className="product-zoom-controls">
              <button
                className="button secondary"
                type="button"
                aria-label="Ảnh trước"
                onClick={() => move(-1)}
              >
                <ChevronLeft aria-hidden="true" />
                Trước
              </button>
              <button
                className="button secondary"
                type="button"
                aria-label="Ảnh tiếp theo"
                onClick={() => move(1)}
              >
                Tiếp theo
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
        </Dialog>
      )}
    </section>
  );
}
