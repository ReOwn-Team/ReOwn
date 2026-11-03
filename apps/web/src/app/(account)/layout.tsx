import { Suspense, type ReactNode } from "react";
import { AccountWorkspace } from "@/features/account/components/account-workspace";
import { LoadingBar } from "@/components/ui/loading-bar";

export default function AccountLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense
            fallback={
                <div className="container page" role="status">
                    <LoadingBar />
                    Đang tải khu vực tài khoản…
                </div>
            }
        >
            <AccountWorkspace>{children}</AccountWorkspace>
        </Suspense>
    );
}
