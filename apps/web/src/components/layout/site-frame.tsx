"use client";
import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Header, Footer, MobileNav } from "@/components/layout/site-shell";

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <>
      {!admin && <Suspense><Header /></Suspense>}
      <main id="noi-dung" tabIndex={-1}>{children}</main>
      {!admin && <><Footer /><MobileNav /></>}
    </>
  );
}
