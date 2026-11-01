import { z } from "zod";
const finding = z
    .object({
        imageIds: z.array(z.string().uuid()).min(1).max(6),
        observation: z.string().min(1).max(1200),
        evidence: z.string().min(1).max(600),
        certainty: z.enum(["low", "medium", "high"]),
    })
    .strict();
export const inspectionReportSchema = z
    .object({
        summary: z.string().min(1).max(1500),
        productObservations: z.array(finding).max(20),
        visibleDefects: z.array(finding).max(20),
        imageQuality: z.array(finding).max(12),
        inconsistencies: z.array(finding).max(12),
        limitations: z.array(z.string().min(1).max(600)).min(1).max(12),
    })
    .strict();
export const INSPECTION_PROMPT_VERSION = "v2";
export type InspectionReport = z.infer<typeof inspectionReportSchema>;
export type InspectionSnapshot = {
    title: string;
    category: string;
    description: string;
    condition: string;
    knownDefects: string;
    images: Array<{ id: string; objectKey: string; sha256: string }>;
};
export const PRODUCT_INSPECTION_PROVIDER = Symbol(
    "PRODUCT_INSPECTION_PROVIDER",
);
export interface ProductInspectionProvider {
    inspect(
        snapshot: InspectionSnapshot,
        images: Array<{ id: string; bytes: Buffer }>,
        promptVersion?: string,
    ): Promise<{ report: InspectionReport; model: string }>;
}
export class InspectionFailure extends Error {
    constructor(
        readonly code: string,
        readonly retryable = false,
        readonly retryAfterSeconds?: number,
        readonly httpStatus?: number,
        readonly stage?: string,
    ) {
        super(code);
    }
}
