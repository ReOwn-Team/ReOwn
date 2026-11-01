"use client";
import { useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { useMock } from "@/mocks/store";

import { authSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/auth/errors";
import { AuthGate } from "@/features/auth/components/auth-gate";

import { ProfileTab } from "@/features/account/components/profile-tab";
import { AddressesTab } from "@/features/account/components/addresses-tab";
import { SecurityTab } from "@/features/account/components/security-tab";
import { VerificationDialog } from "@/features/account/components/verification-dialog";
export function AccountScreen() {
  return (
    <AuthGate title="Đăng nhập để quản lý tài khoản">
      <AccountContent />
    </AuthGate>
  );
}
function AccountContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") ?? "profile";
  const { notify } = useMock();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [kyc, setKyc] = useState(false);
  return (
    <div className="container page">
      <h1>
        {tab === "addresses"
          ? "Địa chỉ nhận hàng"
          : tab === "security"
            ? "Mật khẩu & bảo mật"
            : "Tài khoản của tôi"}
      </h1>
      <div className="account-content">
        <div className="stack">
          {tab === "addresses" ? (
            <AddressesTab />
          ) : tab === "security" ? (
            <SecurityTab />
          ) : (
            <ProfileTab onVerify={() => setKyc(true)} />
          )}
          <div className="account-bottom">
            <button
              className="plain-button"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                setLogoutError("");
                try {
                  await authSession.logout();
                  notify("Đã đăng xuất.");
                  router.replace("/account");
                } catch (error) {
                  setLogoutError(errorMessage(error));
                } finally {
                  setLoggingOut(false);
                }
              }}
            >
              <LogOut size={16} />
              {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
            </button>
            {logoutError && (
              <p className="error" role="alert">
                {logoutError}
              </p>
            )}
          </div>
        </div>
      </div>
      {(kyc || tab === "kyc") && (
        <VerificationDialog
          onClose={() => {
            setKyc(false);
            if (tab === "kyc") router.replace("/account");
          }}
        />
      )}
    </div>
  );
}
