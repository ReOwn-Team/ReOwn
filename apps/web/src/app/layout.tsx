import type { Metadata } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { ServerAuthProvider } from "@/lib/auth/server/provider";
import { ExperienceProvider } from "@/components/layout/experience-provider";
import { MockProvider } from "@/mocks/store";
import {
  Header,
  Footer,
  LiveRegion,
  MobileNav,
} from "@/components/layout/site-shell";
import { AuthOverlay } from "@/features/auth/auth-overlay";
import "./globals.css";
import "@/features/auth/auth.css";
import "@/features/account/account.css";
import "@/features/purchase/purchase.css";

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
                <Suspense>
                  <Header />
                </Suspense>
                <main id="noi-dung" tabIndex={-1}>
                  {children}
                </main>
                <Footer />
                <AuthOverlay />
                <MobileNav />
                <LiveRegion />
              </MockProvider>
            </ExperienceProvider>
          </ServerAuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
