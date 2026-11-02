import { z } from "zod";
import { inspectionReportSchema } from "./inspection-report";
export const reviewStatusSchema = z.enum([
    "not_required",
    "pending",
    "seller_confirmation",
    "approved",
    "rejected",
]);
export const evidenceMetadataSchema = z.object({
    capturedAtLocal: z.string(),
    utcOffset: z.string().nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    make: z.string().nullable(),
    model: z.string().nullable(),
});
export const inspectionSchema = z.object({
    id: z.string().uuid(),
    reviewId: z.string().uuid(),
    status: z.enum([
        "queued",
        "processing",
        "completed",
        "failed",
        "cancelled",
    ]),
    attempts: z.number().int(),
    model: z.string().nullable(),
    promptVersion: z.string(),
    report: inspectionReportSchema.nullable(),
    errorCode: z.string().nullable(),
    nextAttemptAt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export const decisionRequestSchema = z
    .object({
        revision: z.number().int().positive(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().min(1).max(2000).optional(),
    })
    .strict()
    .refine((value) => value.decision !== "reject" || !!value.reason, {
        path: ["reason"],
        message: "Rejection reason is required",
    });
export const decisionResponseSchema = z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    revision: z.number().int(),
    status: z.enum(["approved", "rejected"]),
    reason: z.string().nullable(),
    reviewedBy: z.string().uuid(),
    reviewedAt: z.string(),
});

const listingCorrectionChangesSchema = z
    .object({
        title: z.string().trim().min(4).max(200).optional(),
        category: z
            .enum([
                "Laptop",
                "Điện thoại",
                "Phụ kiện",
                "Sách",
                "Đồ dùng",
                "Sở thích",
            ])
            .optional(),
        description: z.string().trim().min(20).max(10000).optional(),
        condition: z.enum(["Như mới", "Dùng tốt", "Cần sửa chữa"]).optional(),
        knownDefects: z.string().trim().max(2000).optional(),
        location: z.string().trim().min(1).max(200).optional(),
        fulfillmentMethods: z
            .array(z.enum(["shipping", "meetup"]))
            .min(1)
            .max(2)
            .refine((value) => new Set(value).size === value.length)
            .optional(),
    })
    .strict()
    .refine((changes) => Object.keys(changes).length > 0, {
        message: "At least one listing field must be corrected",
    });

export type ListingCorrectionChanges = z.infer<
    typeof listingCorrectionChangesSchema
>;

export const editRequestSchema = z
    .object({
        revision: z.number().int().positive(),
        changes: listingCorrectionChangesSchema,
        note: z.string().trim().min(1).max(2000).optional(),
    })
    .strict();

export const editResponseSchema = z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    revision: z.number().int(),
    status: z.literal("seller_confirmation"),
    reason: z.string().nullable(),
    reviewedBy: z.string().uuid(),
    reviewedAt: z.string(),
});
export const reviewSummarySchema = z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    revision: z.number().int(),
    createdAt: z.string(),
    product: z.object({
        title: z.string(),
        sellerId: z.string().uuid(),
        revision: z.number().int(),
    }),
    inspections: z.array(
        z.object({
            id: z.string().uuid(),
            status: z.string(),
            errorCode: z.string().nullable(),
        }),
    ),
});
export const reviewDetailSchema = z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    revision: z.number().int(),
    status: z.enum([
        "pending",
        "seller_confirmation",
        "approved",
        "rejected",
        "superseded",
    ]),
    snapshot: z.object({
        title: z.string(),
        category: z.string(),
        description: z.string(),
        condition: z.string(),
        knownDefects: z.string(),
        price: z.number().int(),
        location: z.string(),
        fulfillmentMethods: z.array(z.string()),
        images: z.array(
            z.object({
                id: z.string().uuid(),
                url: z.string(),
                sha256: z.string(),
                mimeType: z.string(),
                sizeBytes: z.number().int(),
                sortOrder: z.number().int(),
            }),
        ),
    }),
    reviewedBy: z.string().uuid().nullable(),
    reason: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string(),
    inspections: z.array(inspectionSchema),
    evidence: z.array(
        z.object({
            id: z.string().uuid(),
            metadata: evidenceMetadataSchema,
            sha256: z.string(),
            expiresAt: z.string(),
            purgedAt: z.string().nullable(),
            originalMime: z.string(),
        }),
    ),
    product: z.object({
        revision: z.number().int(),
        reviewStatus: reviewStatusSchema,
        deletedAt: z.string().nullable(),
    }),
});

export const ownerInspectionSchema = z.object({
    revision: z.number().int(),
    reviewStatus: reviewStatusSchema,
    inspection: inspectionSchema
        .pick({
            id: true,
            status: true,
            attempts: true,
            promptVersion: true,
            report: true,
            errorCode: true,
            createdAt: true,
            updatedAt: true,
        })
        .nullable(),
});
