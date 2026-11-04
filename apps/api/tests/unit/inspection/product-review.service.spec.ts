import { ProductReviewService } from "../../../src/inspection/product-review.service";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { ProductStorageService } from "../../../src/storage/product-storage.service";
import { PushService } from "../../../src/push/push.service";

const reviewId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";

describe("ProductReviewService.edit", () => {
    it("moves only the current pending revision to seller confirmation and audits field names only", async () => {
        const tx = {
            productReview: {
                findUnique: jest.fn().mockResolvedValue({
                    id: reviewId,
                    productId,
                    revision: 4,
                    status: "pending",
                }),
                update: jest.fn().mockResolvedValue({
                    id: reviewId,
                    productId,
                    revision: 4,
                    status: "seller_confirmation",
                    reason: "Please use the corrected title",
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                }),
            },
            $queryRaw: jest.fn().mockResolvedValue([]),
            product: {
                findUnique: jest.fn().mockResolvedValue({
                    id: productId,
                    revision: 4,
                    status: "hidden",
                    reviewStatus: "pending",
                    deletedAt: null,
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            category: { findFirst: jest.fn() },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
        };
        const prisma = {
            $transaction: jest.fn(async (work) => work(tx)),
        };
        const service = new ProductReviewService(
            prisma as unknown as PrismaService,
            {} as ProductStorageService,
            { notifyReview: jest.fn() } as unknown as PushService,
        );

        await service.edit(
            reviewId,
            4,
            { title: "Corrected listing title" },
            "Please use the corrected title",
            adminId,
        );

        expect(tx.product.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    title: "Corrected listing title",
                    reviewStatus: "seller_confirmation",
                    status: "hidden",
                    publishedAt: null,
                }),
            }),
        );
        expect(tx.productReview.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "seller_confirmation",
                    reason: "Please use the corrected title",
                }),
            }),
        );
        expect(tx.auditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "admin.product_review.edit",
                metadata: {
                    revision: 4,
                    fields: ["title"],
                    noteProvided: true,
                },
            }),
        });
        expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
            "Corrected listing title",
        );
        expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
            "Please use the corrected title",
        );
    });
});
