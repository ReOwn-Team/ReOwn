import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/admin-shell";
import "@/features/admin/admin.css";

export const metadata: Metadata = { title: "Quản trị", robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
