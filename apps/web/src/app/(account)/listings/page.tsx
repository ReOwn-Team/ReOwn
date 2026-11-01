import type { Metadata } from "next";
import { ListingsScreen } from "@/features/selling/listings-screen";
import "@/features/selling/selling.css";

export const metadata: Metadata = { title: "Tin đăng của tôi" };

export default function ListingsPage() {
  return <ListingsScreen />;
}
