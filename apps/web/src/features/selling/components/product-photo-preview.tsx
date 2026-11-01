"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
export function ProductPhotoPreview({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  const heic = /^data:image\/hei[cf](?:-sequence)?;base64,/.test(src);
  const [preview, setPreview] = useState<{
    source: string;
    url: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!heic) return;
    let active = true,
      objectUrl: string | undefined;
    void (async () => {
      try {
        const original = await (await fetch(src)).blob();
        const { heicTo } = await import("heic-to/next");
        const bytes = await heicTo({
          blob: original,
          type: "image/jpeg",
          quality: 0.8,
        });
        if (!active) return;
        objectUrl = URL.createObjectURL(bytes);
        setPreview({ source: src, url: objectUrl });
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [heic, src]);
  if (heic && preview?.source !== src)
    return (
      <span className="small muted" role="status">
        {failed
          ? "Không xem trước được HEIC. Ảnh gốc vẫn được giữ để gửi kiểm tra."
          : "Đang đọc ảnh HEIC…"}
      </span>
    );
  return (
    <Image
      src={heic ? preview!.url : src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
    />
  );
}
