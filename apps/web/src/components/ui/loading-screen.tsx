"use client";

import { Skeleton } from "@/components/primitives/skeleton";
export type LoadingVariant = "catalog" | "form" | "list" | "detail";
function TextLines() {
  return (
    <div className="stack">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
export function LoadingScreen({
  variant = "catalog",
}: {
  variant?: LoadingVariant;
}) {
  return (
    <div
      className="container page"
      aria-busy="true"
      aria-label="Đang tải dữ liệu"
      role="status"
    >
      <span className="sr-only">Đang tải dữ liệu…</span>
      <div className="stack" aria-hidden="true">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
      {variant === "catalog" ? (
        <div className="product-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel stack">
              <Skeleton className="aspect-4/3 w-full" />
              <TextLines />
            </div>
          ))}
        </div>
      ) : variant === "detail" ? (
        <div className="two-column" aria-hidden="true">
          <Skeleton className="aspect-4/3 w-full" />
          <div className="panel stack">
            <TextLines />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : (
        <div className="stack" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div className="panel stack" key={i}>
              {variant === "list" ? (
                <div className="flex items-center gap-4">
                  <Skeleton className="size-20 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <TextLines />
                  </div>
                </div>
              ) : (
                <>
                  <Skeleton className="h-5 w-40 max-w-full" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
