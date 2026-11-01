import { z } from "zod";
export const otpVerifySchema = z
    .object({
        challengeId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        code: z.string().regex(/^\d{6}$/),
    })
    .strict();
export const otpResendSchema = otpVerifySchema.omit({ code: true });
export type OtpVerifyDto = z.infer<typeof otpVerifySchema>;
export type OtpChallenge = {
    requiresOtp: true;
    challengeId: string;
    emailHint: string;
    expiresIn: number;
    resendAfter: number;
};
