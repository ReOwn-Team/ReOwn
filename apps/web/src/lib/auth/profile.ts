import type { UserProfile } from "@reown/api-contract";

export function validProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return (
    ["id", "displayName", "email", "phone", "role", "status"].every(
      (key) => typeof profile[key] === "string",
    ) &&
    ["phoneVerified", "emailVerified", "kycStatus"].every(
      (key) => typeof profile[key] === "number",
    )
  );
}

export type OtpChallenge = {
  requiresOtp: true;
  challengeId: string;
  emailHint: string;
  expiresIn: number;
  resendAfter: number;
};
export function validOtpChallenge(value: unknown): value is OtpChallenge {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.requiresOtp === true &&
    typeof v.challengeId === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(v.challengeId) &&
    typeof v.emailHint === "string" &&
    v.emailHint.length <= 254 &&
    Number.isInteger(v.expiresIn) &&
    Number(v.expiresIn) >= 0 &&
    Number(v.expiresIn) <= 300 &&
    Number.isInteger(v.resendAfter) &&
    Number(v.resendAfter) >= 0 &&
    Number(v.resendAfter) <= 3600
  );
}
