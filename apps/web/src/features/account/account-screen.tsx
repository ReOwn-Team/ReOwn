"use client";
import { useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

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
