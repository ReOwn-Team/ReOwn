import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderDetailScreen } from "@/features/purchase/order-detail-screen";
import "@/features/purchase/purchase.css";

export const metadata: Metadata = { title: "Chi tiết đơn hàng" };

// Order state lives in client memory; allow blocking render instead of prerender.
export const instant = false;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <OrderDetailScreen id={id} />
    </Suspense>
  );
}
