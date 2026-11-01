import { Suspense } from "react";
import type { Metadata } from "next";
import { SellScreen } from "@/features/selling/sell-screen";
import "@/features/selling/selling.css";

export const metadata: Metadata = { title: "Đăng bán sản phẩm" };

export default function SellPage() {
  return (
    <Suspense>
      <SellScreen />
    </Suspense>
  );
}
