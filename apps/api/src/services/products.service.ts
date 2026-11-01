import { ProductStorageService } from "../storage/product-storage.service";
import type {} from "multer";
import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    HttpException,
    NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { ProductPhotoService } from "../inspection/product-photo.service";
import {
    inspectionReportSchema,
    INSPECTION_PROMPT_VERSION,
} from "../inspection/inspection-report";
import { photoError } from "../inspection/photo-metadata";
import { PrismaService } from "../prisma/prisma.service";
import type { ProductInput } from "../dtos/product.dto";
import type { Prisma } from "../generated/prisma/client";

const include = {
    category: { select: { name: true } },
    seller: { select: { id: true, displayName: true } },
    images: { orderBy: { sortOrder: "asc" as const } },
    reviews: {
        orderBy: { revision: "desc" as const },
        take: 1,
        select: { reason: true },
    },
};
type Row = Prisma.ProductGetPayload<{ include: typeof include }>;
@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: ProductStorageService,
        private readonly photos: ProductPhotoService,
    ) {}
    private serialize(row: Row, owner = true) {
        return {
            id: row.id,
            title: row.title,
            category: row.category.name,
            description: row.description,
            price: row.price,
            condition: row.condition,
            knownDefects: row.knownDefects ?? "",
            location: row.location,
            fulfillmentMethods: row.fulfillmentMethods,
            status: row.status,
            reviewStatus: row.reviewStatus,
            revision: row.revision,
            rejectionReason: owner ? (row.reviews[0]?.reason ?? null) : null,
            seller: row.seller,
            publishedAt: row.publishedAt?.toISOString() ?? null,
            updatedAt: row.updatedAt.toISOString(),
            images: row.images.map((image) => ({
                id: image.id,
                url: owner
                    ? `/api/products/mine/${row.id}/images/${image.id}`
                    : `/api/product-images/${image.id}`,
                mimeType: image.mimeType,
                sizeBytes: image.sizeBytes,
            })),
        };
    }
    async list(sellerId?: string) {
        const rows = await this.prisma.product.findMany({
            where: {
                deletedAt: null,
                ...(sellerId
                    ? { sellerId }
                    : {
                          status: "published",
                          reviewStatus: { in: ["approved", "not_required"] },
                      }),
            },
            include,
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        return rows.map((row) => this.serialize(row, !!sellerId));
    }
    async get(id: string, sellerId?: string) {
        const row = await this.prisma.product.findFirst({
            where: {
                id,
                deletedAt: null,
                ...(sellerId
                    ? { sellerId }
                    : {
                          status: "published",
                          reviewStatus: { in: ["approved", "not_required"] },
                      }),
            },
            include,
        });
        if (!row) throw new NotFoundException("Listing not found");
        return this.serialize(row, !!sellerId);
    }
    async save(
        sellerId: string,
        dto: ProductInput,
        files: Express.Multer.File[],
        editingId?: string,
    ) {
        const digest = createHash("sha256").update(JSON.stringify(dto));
        for (const file of files) digest.update(file.buffer);
        const requestHash = digest.digest("hex");
        if (!editingId && dto.requestId) {
            const previous = await this.prisma.product.findUnique({
                where: { id: dto.requestId },
                include,
            });
            if (previous) {
                if (previous.sellerId !== sellerId || previous.deletedAt)
                    throw new ConflictException("Cannot create listing");
                if (previous.requestHash !== requestHash)
                    throw new ConflictException(
                        "Request ID was already used with different content",
                    );
                return this.serialize(previous);
            }
        }
        const category = await this.prisma.category.findFirst({
            where: { name: dto.category, isActive: true },
            orderBy: { sortOrder: "asc" },
        });
        if (!category) throw new BadRequestException("Category is unavailable");
        const uploads = dto.images
            .filter((image): image is { upload: number } => "upload" in image)
            .map((image) => image.upload);
        if (
            uploads.length !== files.length ||
            new Set(uploads).size !== uploads.length ||
            uploads.some((index) => !files[index])
        )
            throw new BadRequestException("Invalid photo order");
        const retained = dto.images
            .filter((image): image is { id: string } => "id" in image)
            .map((image) => image.id);
        if (
            new Set(retained).size !== retained.length ||
            (!editingId && retained.length)
        )
            throw new BadRequestException("Invalid photos");
        const written: string[] = [];
        let obsolete: string[] = [];
        let stage = "photo_validation";
        try {
            const productId = editingId ?? dto.requestId ?? randomUUID();
            // Validate every original before writing any R2 object.
            const validated: Array<
                Awaited<ReturnType<ProductPhotoService["prepare"]>>
            > = [];
            for (let i = 0; i < files.length; i++) {
                const imageIndex = dto.images.findIndex(
                    (image) => "upload" in image && image.upload === i,
                );
                validated.push(
                    await this.photos.prepare(files[i].buffer, imageIndex),
                );
            }
            const prepared = validated.map((photo, i) => ({
                id: randomUUID(),
                objectKey: "",
                mimeType: "image/webp",
                sizeBytes: photo.bytes.length,
                sha256: createHash("sha256")
                    .update(files[i].buffer)
                    .digest("hex"),
            }));
            const hashes = new Map<string, string>(
                prepared.map((image) => [image.id, image.sha256]),
            );
            if (prepared.length) {
                stage = "evidence_save";
                // Track every original before any upload; one database round trip.
                await this.prisma.productEvidence.createMany({
                    data: prepared.map((image, i) => ({
                        id: image.id,
                        productId,
                        originalKey: this.storage.originalKey(image.id),
                        originalMime: validated[i].originalMime,
                        sha256: image.sha256,
                        metadata: validated[i].metadata,
                        expiresAt: new Date(Date.now() + 30 * 86400000),
                    })),
                });
            }
            stage = "photo_upload";
            // At most two photos (four PUTs) in flight. Settle the entire batch
            // before throwing so cleanup cannot race an unfinished upload.
            for (let offset = 0; offset < prepared.length; offset += 2) {
                const results = await Promise.allSettled(
                    prepared
                        .slice(offset, offset + 2)
                        .flatMap((image, index) => {
                            const i = offset + index;
                            written.push(this.storage.originalKey(image.id));
                            return [
                                this.storage
                                    .put(image.id, validated[i].bytes)
                                    .then((key) => {
                                        image.objectKey = key;
                                        written.push(key);
                                    }),
                                this.storage.putOriginal(
                                    image.id,
                                    files[i].buffer,
                                ),
                            ];
                        }),
                );
                const failed = results.find(
                    (result) => result.status === "rejected",
                );
                if (failed?.status === "rejected") throw failed.reason;
            }
            stage = "listing_transaction";
            const row = await this.prisma.$transaction(
                async (tx) => {
                    let current: Row | null = null;
                    if (editingId) {
                        await tx.$queryRaw`SELECT id FROM products WHERE id = ${editingId}::uuid FOR UPDATE`;
                        current = await tx.product.findFirst({
                            where: { id: editingId, sellerId, deletedAt: null },
                            include,
                        });
                        if (!current)
                            throw new NotFoundException("Listing not found");
                        if (current.status === "sold")
                            throw new ConflictException(
                                "Sold listings cannot be edited",
                            );
                        if (
                            retained.some(
                                (id) =>
                                    !current!.images.some(
                                        (image) => image.id === id,
                                    ),
                            )
                        )
                            throw new BadRequestException("Invalid photos");
                        obsolete = current.images
                            .filter((image) => !retained.includes(image.id))
                            .map((image) => image.objectKey);
                    }
                    if (retained.length) {
                        const evidence = await tx.productEvidence.findMany({
                            where: { id: { in: retained }, productId },
                            select: { id: true, sha256: true },
                        });
                        for (const item of evidence)
                            hashes.set(item.id, item.sha256);
                        const valid = new Set(evidence.map((item) => item.id));
                        for (const id of retained)
                            if (!valid.has(id))
                                throw photoError(
                                    dto.images.findIndex(
                                        (image) =>
                                            "id" in image && image.id === id,
                                    ),
                                    "ORIGINAL_REQUIRED",
                                );
                    }
                    const imageData = dto.images
                        .map((image, sortOrder) => ({
                            ...("upload" in image
                                ? prepared[image.upload]
                                : current!.images.find(
                                      (item) => item.id === image.id,
                                  )!),
                            sortOrder,
                        }))
                        .map(
                            ({
                                id,
                                objectKey,
                                mimeType,
                                sizeBytes,
                                sortOrder,
                            }) => ({
                                id,
                                objectKey,
                                mimeType,
                                sizeBytes,
                                sortOrder,
                            }),
                        );
                    const data = {
                        categoryId: category.id,
                        title: dto.title,
                        description: dto.description,
                        price: dto.price,
                        amount: 1,
                        condition: dto.condition,
                        knownDefects: dto.knownDefects,
                        location: dto.location,
                        fulfillmentMethods: dto.fulfillmentMethods,
                    };
                    const revision = (current?.revision ?? 0) + 1;
                    if (current)
                        await tx.productReview.updateMany({
                            where: { productId, status: "pending" },
                            data: { status: "superseded" },
                        });
                    if (current)
                        await tx.productImage.deleteMany({
                            where: { productId: current.id },
                        });
                    const review = {
                        revision,
                        snapshot: {
                            ...data,
                            category: dto.category,
                            images: imageData.map((image) => ({
                                ...image,
                                sha256: hashes.get(image.id)!,
                            })),
                        },
                        inspections: {
                            create: {
                                promptVersion: INSPECTION_PROMPT_VERSION,
                            },
                        },
                    };
                    const submission = {
                        ...data,
                        status: "hidden",
                        reviewStatus: "pending",
                        revision,
                        publishedAt: null,
                        images: { createMany: { data: imageData } },
                        reviews: { create: review },
                    };
                    const result = current
                        ? await tx.product.update({
                              where: { id: current.id },
                              data: submission,
                              include,
                          })
                        : await tx.product.create({
                              data: {
                                  ...submission,
                                  id: productId,
                                  sellerId,
                                  requestHash,
                              },
                              include,
                          });
                    return result;
                },
                { timeout: 15000 },
            );
            await Promise.allSettled(
                obsolete.map((key) => this.storage.delete(key)),
            );
            return this.serialize(row);
        } catch (error) {
            // Expected validation errors need no log. Include service failures:
            // Nest does not log HttpExceptions such as R2's 503 automatically.
            if (!(error instanceof HttpException) || error.getStatus() >= 500) {
                const code =
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    typeof error.code === "string" &&
                    /^[A-Z0-9_]{1,40}$/.test(error.code)
                        ? error.code
                        : "UNAVAILABLE";
                this.logger.error(
                    `Listing save failed: stage=${stage} code=${code}`,
                );
            }
            const cleanup = await Promise.allSettled(
                written.map((key) => this.storage.delete(key)),
            );
            if (cleanup.some((result) => result.status === "rejected"))
                this.logger.warn(
                    "Product object cleanup incomplete; original expiry remains tracked",
                );
            if (
                !editingId &&
                dto.requestId &&
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "P2002"
            ) {
                const previous = await this.prisma.product.findFirst({
                    where: {
                        id: dto.requestId,
                        sellerId,
                        requestHash,
                        deletedAt: null,
                    },
                    include,
                });
                if (previous) return this.serialize(previous);
                throw new ConflictException(
                    "Cannot create listing with this request ID",
                );
            }
            throw error;
        }
    }
    async status(
        id: string,
        sellerId: string,
        status: "published" | "hidden" | "sold",
    ) {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
            const row = await tx.product.findFirst({
                where: { id, sellerId, deletedAt: null },
            });
            if (!row) throw new NotFoundException("Listing not found");
            if (
                status === "published" &&
                !["approved", "not_required"].includes(row.reviewStatus)
            )
                throw new ConflictException(
                    "Listing must be approved by an administrator",
                );
            if (row.status === "sold" && status !== "sold")
                throw new ConflictException("Sold listings cannot be reopened");
            return this.serialize(
                await tx.product.update({
                    where: { id },
                    data: {
                        status,
                        ...(status === "published" && !row.publishedAt
                            ? { publishedAt: new Date() }
                            : {}),
                    },
                    include,
                }),
            );
        });
    }
    async remove(id: string, sellerId: string) {
        await this.prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
                const row = await tx.product.findFirst({
                    where: { id, sellerId, deletedAt: null },
                });
                if (!row) throw new NotFoundException();
                if (
                    row.status === "sold" ||
                    (await tx.order.count({ where: { productId: id } }))
                )
                    throw new ConflictException(
                        "Listings with sales or orders cannot be deleted",
                    );
                await tx.product.update({
                    where: { id },
                    data: { deletedAt: new Date(), status: "hidden" },
                });
                await tx.productReview.updateMany({
                    where: { productId: id, status: "pending" },
                    data: { status: "superseded" },
                });
                await tx.productInspection.updateMany({
                    where: {
                        review: { productId: id },
                        status: { in: ["queued", "processing"] },
                    },
                    data: { status: "cancelled", errorCode: "LISTING_DELETED" },
                });
            },
            { timeout: 15000 },
        );
    }
    async inspection(id: string, sellerId: string) {
        const product = await this.prisma.product.findFirst({
            where: { id, sellerId, deletedAt: null },
            select: { revision: true, reviewStatus: true },
        });
        if (!product) throw new NotFoundException();
        const review = await this.prisma.productReview.findFirst({
            where: {
                productId: id,
                revision: product.revision,
                product: { sellerId, deletedAt: null },
            },
            select: {
                inspections: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        attempts: true,
                        promptVersion: true,
                        errorCode: true,
                        report: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });
        const inspection = review?.inspections[0];
        return {
            revision: product.revision,
            reviewStatus: product.reviewStatus,
            inspection: inspection
                ? {
                      ...inspection,
                      // Only completed, validated observations. Never evidence metadata,
                      // provider response bodies, private keys or previous revisions.
                      report:
                          inspection.status === "completed"
                              ? inspectionReportSchema.parse(inspection.report)
                              : null,
                      createdAt: inspection.createdAt.toISOString(),
                      updatedAt: inspection.updatedAt.toISOString(),
                  }
                : null,
        };
    }
    async image(id: string, sellerId?: string, productId?: string) {
        const image = await this.prisma.productImage.findFirst({
            where: {
                id,
                product: {
                    deletedAt: null,
                    ...(sellerId
                        ? { id: productId, sellerId }
                        : {
                              status: "published",
                              reviewStatus: {
                                  in: ["approved", "not_required"],
                              },
                          }),
                },
            },
            select: { objectKey: true },
        });
        if (!image) throw new NotFoundException();
        return this.storage.read(image.objectKey);
    }
}
