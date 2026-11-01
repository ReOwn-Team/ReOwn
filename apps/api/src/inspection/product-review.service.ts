import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProductStorageService } from "../storage/product-storage.service";
import {
    INSPECTION_PROMPT_VERSION,
    type InspectionSnapshot,
} from "./inspection-report";
@Injectable()
export class ProductReviewService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: ProductStorageService,
    ) {}
    async list(cursor?: string) {
        return this.prisma.productReview
            .findMany({
                where: {
                    status: "pending",
                    product: { deletedAt: null, reviewStatus: "pending" },
                },
                orderBy: { createdAt: "asc" },
                take: 50,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: {
                    id: true,
                    productId: true,
                    revision: true,
                    createdAt: true,
                    product: {
                        select: { title: true, sellerId: true, revision: true },
                    },
                    inspections: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { id: true, status: true, errorCode: true },
                    },
                },
            })
            .then((rows) =>
                rows.filter((row) => row.revision === row.product.revision),
            );
    }
    async detail(id: string) {
        const row = await this.prisma.productReview.findUnique({
            where: { id },
            include: {
                inspections: { orderBy: { createdAt: "asc" } },
                product: {
                    select: {
                        revision: true,
                        reviewStatus: true,
                        deletedAt: true,
                    },
                },
            },
        });
        if (!row || row.product.deletedAt) throw new NotFoundException();
        const snapshot = row.snapshot as unknown as InspectionSnapshot;
        const evidence = await this.prisma.productEvidence.findMany({
            where: {
                productId: row.productId,
                id: { in: snapshot.images.map((image) => image.id) },
            },
            select: {
                id: true,
                metadata: true,
                sha256: true,
                expiresAt: true,
                purgedAt: true,
                originalMime: true,
            },
        });
        // Storage keys are internal, not download URLs.
        return {
            ...row,
            snapshot: {
                ...snapshot,
                images: snapshot.images.map(({ objectKey, ...image }) => ({
                    ...image,
                    url: `/api/v1/admin/product-reviews/${id}/images/${image.id}`,
                })),
            },
            evidence,
        };
    }
    async image(reviewId: string, imageId: string, original: boolean) {
        const review = await this.prisma.productReview.findUnique({
            where: { id: reviewId },
            include: { product: { select: { deletedAt: true } } },
        });
        if (!review || review.product.deletedAt) throw new NotFoundException();
        const image = (
            review.snapshot as unknown as InspectionSnapshot
        ).images.find((item) => item.id === imageId);
        if (!image) throw new NotFoundException();
        if (!original)
            return {
                bytes: await this.storage.read(image.objectKey),
                mime: "image/webp",
            };
        const evidence = await this.prisma.productEvidence.findFirst({
            where: {
                id: imageId,
                productId: review.productId,
                expiresAt: { gt: new Date() },
                purgedAt: null,
            },
        });
        if (!evidence?.originalKey)
            throw new NotFoundException(
                "Original photo expired or unavailable",
            );
        return {
            bytes: await this.storage.read(evidence.originalKey),
            mime: evidence.originalMime,
        };
    }
    async decide(
        id: string,
        revision: number,
        decision: "approve" | "reject",
        reason: string | undefined,
        adminId: string,
    ) {
        if (decision === "reject" && !reason?.trim())
            throw new BadRequestException("Rejection reason is required");
        return this.prisma.$transaction(async (tx) => {
            const review = await tx.productReview.findUnique({ where: { id } });
            if (!review) throw new NotFoundException();
            await tx.$queryRaw`SELECT id FROM products WHERE id=${review.productId}::uuid FOR UPDATE`;
            const product = await tx.product.findUnique({
                where: { id: review.productId },
            });
            if (
                !product ||
                product.deletedAt ||
                product.status === "sold" ||
                product.revision !== revision ||
                review.revision !== revision ||
                product.reviewStatus !== "pending" ||
                review.status !== "pending"
            )
                throw new ConflictException(
                    "Review revision is stale or already decided",
                );
            const status = decision === "approve" ? "approved" : "rejected";
            await tx.product.update({
                where: { id: product.id },
                data: {
                    reviewStatus: status,
                    status: decision === "approve" ? "published" : "hidden",
                    publishedAt: decision === "approve" ? new Date() : null,
                },
            });
            return tx.productReview.update({
                where: { id },
                data: {
                    status,
                    reason: reason?.trim() ?? null,
                    reviewedBy: adminId,
                    reviewedAt: new Date(),
                },
                select: {
                    id: true,
                    productId: true,
                    revision: true,
                    status: true,
                    reason: true,
                    reviewedBy: true,
                    reviewedAt: true,
                },
            });
        });
    }
    async retry(id: string) {
        return this.prisma.$transaction(async (tx) => {
            const review = await tx.productReview.findUnique({ where: { id } });
            if (!review) throw new NotFoundException();
            await tx.$queryRaw`SELECT id FROM products WHERE id=${review.productId}::uuid FOR UPDATE`;
            const product = await tx.product.findUnique({
                where: { id: review.productId },
            });
            if (
                !product ||
                product.deletedAt ||
                product.revision !== review.revision ||
                review.status !== "pending"
            )
                throw new ConflictException("Review is no longer current");
            if (
                await tx.productInspection.count({
                    where: {
                        reviewId: id,
                        status: { in: ["queued", "processing"] },
                    },
                })
            )
                throw new ConflictException("An inspection is already queued");
            return tx.productInspection.create({
                data: {
                    reviewId: id,
                    promptVersion: INSPECTION_PROMPT_VERSION,
                },
            });
        });
    }
}
