import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutScreen } from "@/features/purchase/checkout-screen";
import "@/features/purchase/purchase.css";

export const metadata: Metadata = { title: "Thanh toán" };

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutScreen />
    </Suspense>
  );
}
