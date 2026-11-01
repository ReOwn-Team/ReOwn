import { Suspense, type ReactNode } from "react";
import { AccountWorkspace } from "@/features/account/components/account-workspace";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AccountWorkspace>{children}</AccountWorkspace>
    </Suspense>
  );
}
