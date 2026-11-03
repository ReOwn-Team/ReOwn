import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutScreen } from "@/features/purchase/checkout-screen";
import { LoadingBar } from "@/components/ui/loading-bar";
import "@/features/purchase/purchase.css";

export const metadata: Metadata = { title: "Thanh toán" };

export default function CheckoutPage() {
    return (
        <Suspense
            fallback={
                <div className="container page" role="status">
                    <LoadingBar />
                    Đang tải trang thanh toán…
                </div>
            }
        >
            <CheckoutScreen />
        </Suspense>
    );
}
