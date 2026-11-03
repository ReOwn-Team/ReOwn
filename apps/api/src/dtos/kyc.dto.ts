import { z } from "zod";

/** Bump when the consent wording changes; users must re-consent. */
export const KYC_CONSENT_VERSION = "kyc-2026-11-v3";

/** Value stored in `User.kycStatus`. */
export const KycUserStatus = {
    NONE: 0,
    PENDING: 1,
    VERIFIED: 2,
    REJECTED: 3,
} as const;

export const KYC_FLAGS = [
    "face_low_match",
    "name_mismatch",
    "name_unreadable",
    "dob_unreadable",
    "cohort_unreadable",
    "cohort_not_started",
    "age_out_of_range",
    "student_id_unverified",
    "student_id_ocr_conflict",
    "student_id_cohort_mismatch",
] as const;
export type KycFlag = (typeof KYC_FLAGS)[number];

export const kycConsentSchema = z.literal(KYC_CONSENT_VERSION);

export const kycDecisionSchema = z
    .object({
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().min(3).max(500).optional(),
        /** Admin correction of the OCR reading, re-indexed on approval. */
        studentId: z
            .string()
            .regex(/^\d{10}$/)
            .optional(),
    })
    .strict()
    .superRefine((value, context) => {
        if (value.decision === "reject" && !value.reason)
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reason"],
                message: "A reason is required when rejecting",
            });
    });
export type KycDecision = z.infer<typeof kycDecisionSchema>;
