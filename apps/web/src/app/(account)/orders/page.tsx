import type { Metadata } from "next";
import { OrdersScreen } from "@/features/purchase/orders-screen";
import "@/features/purchase/purchase.css";

export const metadata: Metadata = { title: "Đơn mua của tôi" };

export default function OrdersPage() {
  return <OrdersScreen />;
}
