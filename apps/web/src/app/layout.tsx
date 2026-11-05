import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { ServerAuthProvider } from "@/lib/auth/server/provider";
import { ExperienceProvider } from "@/components/layout/experience-provider";
import { MockProvider } from "@/mocks/store";
import { LiveRegion } from "@/components/layout/site-shell";
import { SiteFrame } from "@/components/layout/site-frame";
import { PwaRegistration } from "@/components/layout/pwa-registration";
import { AuthOverlay } from "@/features/auth/auth-overlay";
import "./globals.css";
import "@/features/auth/auth.css";
import "@/features/account/account.css";
import "@/features/purchase/purchase.css";

export const viewport: Viewport = {
    themeColor: [
        { media: "(max-width: 767px)", color: "#ed8324" },
        { media: "(min-width: 768px)", color: "#ffffff" },
    ],
};

export const metadata: Metadata = {
    title: {
        default: "ReOwn — Đồ cũ, khởi đầu mới",
        template: "%s | ReOwn",
    },
    description: "Không gian trao đổi đồ đã qua sử dụng dành cho sinh viên.",
};

export default function RootLayout({
    children,
}: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="vi">
            <body>
                <PwaRegistration />
                <Suspense
                    fallback={
                        <div className="container" role="status">
                            Đang tải ReOwn…
                        </div>
                    }
                >
                    <ServerAuthProvider>
                        <ExperienceProvider>
                            <MockProvider>
                                <a className="skip-link" href="#noi-dung">
                                    Chuyển đến nội dung
                                </a>
                                <SiteFrame>{children}</SiteFrame>
                                <AuthOverlay />
                                <LiveRegion />
                            </MockProvider>
                        </ExperienceProvider>
                    </ServerAuthProvider>
                </Suspense>
            </body>
        </html>
    );
}
