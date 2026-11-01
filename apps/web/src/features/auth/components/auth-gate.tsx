"use client";
import { type ReactNode } from "react";

import { UserRound } from "lucide-react";

import { useAuth } from "@/lib/auth/provider";

import { useMock } from "@/mocks/store";
import {
  LoadingScreen,
  type LoadingVariant,
} from "@/components/ui/loading-screen";
export function AuthGate({
  children,
  title = "Đăng nhập để tiếp tục",
  loadingVariant = "form",
}: {
  children: ReactNode;
  title?: string;
  loadingVariant?: LoadingVariant;
}) {
  const { user, ready, setAuthOpen } = useMock();
  const auth = useAuth();
  if (!ready || auth.status === "checking")
    return <LoadingScreen variant={loadingVariant} />;
  if (!user)
    return (
      <div className="container page">
        <div className="empty-state">
          <UserRound size={36} aria-hidden="true" />
          <h1>{title}</h1>
          <p>{auth.error || "Đăng nhập tài khoản ReOwn để tiếp tục."}</p>
          <button
            type="button"
            className="button primary"
            onClick={() => setAuthOpen(true)}
          >
            Đăng nhập
          </button>
        </div>
      </div>
    );
  return children;
}
