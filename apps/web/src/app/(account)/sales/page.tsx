import type { Metadata } from "next";
import { SalesScreen } from "@/features/selling/sales-screen";
import "@/features/selling/selling.css";

export const metadata: Metadata = { title: "Đơn bán" };

export default function SalesPage() {
  return <SalesScreen />;
}
