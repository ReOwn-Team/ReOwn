import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountScreen } from "@/features/account/account-screen";
import "@/features/account/account.css";

export const metadata: Metadata = { title: "Tài khoản của tôi" };

export default function AccountPage() {
  return (
    <Suspense>
      <AccountScreen />
    </Suspense>
  );
}
