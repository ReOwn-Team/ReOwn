import { Logger } from "@nestjs/common";
import { ProductsService } from "../../../src/services/products.service";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { ProductStorageService } from "../../../src/storage/product-storage.service";
import { ProductPhotoService } from "../../../src/inspection/product-photo.service";
import type { ProductInput } from "../../../src/dtos/product.dto";

it("waits for every in-flight upload before cleanup and stops scheduling after failure", async () => {
    let finishPreview!: (key: string) => void;
    let previewStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        previewStarted = resolve;
    });
    const slowPreview = new Promise<string>((resolve) => {
        finishPreview = resolve;
    });
    const prisma = {
        category: {
            findFirst: jest.fn().mockResolvedValue({ id: "category" }),
        },
        productEvidence: {
            createMany: jest.fn().mockResolvedValue({ count: 3 }),
        },
        $transaction: jest.fn(),
    };
    const failure = new Error("upload failed");
    const storage = {
        originalKey: (id: string) => `original:${id}`,
        put: jest
            .fn()
            .mockRejectedValueOnce(failure)
            .mockImplementationOnce(() => {
                previewStarted();
                return slowPreview;
            }),
        putOriginal: jest.fn().mockResolvedValue("original"),
        delete: jest.fn().mockResolvedValue(undefined),
    };
    const photos = {
        prepare: jest.fn().mockResolvedValue({
            bytes: Buffer.from("preview"),
            metadata: {},
            originalMime: "image/jpeg",
        }),
    };
    const service = new ProductsService(
        prisma as unknown as PrismaService,
        storage as unknown as ProductStorageService,
        photos as unknown as ProductPhotoService,
    );
    const log = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
    try {
        const dto = {
            category: "Laptop",
            images: [{ upload: 0 }, { upload: 1 }, { upload: 2 }],
        } as ProductInput;
        const files = [0, 1, 2].map(() => ({
            buffer: Buffer.from("original"),
        })) as Express.Multer.File[];
        const saving = service.save("seller", dto, files);
        const rejected = expect(saving).rejects.toBe(failure);
        await started;
        expect(storage.delete).not.toHaveBeenCalled();
        expect(storage.put).toHaveBeenCalledTimes(2);
        finishPreview("preview:second");
        await rejected;
        expect(storage.delete).toHaveBeenCalledWith("preview:second");
        expect(storage.delete).toHaveBeenCalledTimes(3);
        expect(storage.putOriginal).toHaveBeenCalledTimes(2);
        expect(prisma.productEvidence.createMany).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
        log.mockRestore();
    }
});

it("publishes a seller confirmation when only title and price changed", async () => {
    const dto = {
        category: "Laptop",
        title: "Corrected listing title",
        description: "A sufficiently detailed immutable listing description.",
        price: 1200000,
        condition: "Dùng tốt",
        knownDefects: "",
        location: "Hà Nội",
        fulfillmentMethods: ["shipping", "meetup"],
        images: [
            { id: "11111111-1111-4111-8111-111111111111" },
            { id: "22222222-2222-4222-8222-222222222222" },
        ],
        confirmed: true,
    } as ProductInput;
    const current = {
        id: "33333333-3333-4333-8333-333333333333",
        sellerId: "seller",
        categoryId: "category",
        category: { name: "Laptop" },
        title: "Admin corrected title",
        description: dto.description,
        price: 1000000,
        amount: 1,
        condition: dto.condition,
        knownDefects: dto.knownDefects,
        location: dto.location,
        fulfillmentMethods: dto.fulfillmentMethods,
        status: "hidden",
        reviewStatus: "seller_confirmation",
        revision: 3,
        publishedAt: null,
        deletedAt: null,
        updatedAt: new Date(),
        images: [
            {
                id: "11111111-1111-4111-8111-111111111111",
                objectKey: "one",
                mimeType: "image/webp",
                sizeBytes: 1,
                sortOrder: 0,
            },
            {
                id: "22222222-2222-4222-8222-222222222222",
                objectKey: "two",
                mimeType: "image/webp",
                sizeBytes: 1,
                sortOrder: 1,
            },
        ],
        seller: { id: "seller", displayName: "Seller" },
        reviews: [{ reason: null }],
    };
    const published = {
        ...current,
        title: dto.title,
        price: dto.price,
        status: "published",
        reviewStatus: "approved",
        publishedAt: new Date(),
    };
    const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        product: {
            findFirst: jest.fn().mockResolvedValue(current),
            update: jest.fn().mockResolvedValue({}),
            findUniqueOrThrow: jest.fn().mockResolvedValue(published),
        },
        productReview: {
            findFirst: jest.fn().mockResolvedValue({ id: "review" }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        productEvidence: { findMany: jest.fn() },
        productImage: { deleteMany: jest.fn() },
    };
    const prisma = {
        category: {
            findFirst: jest.fn().mockResolvedValue({ id: "category" }),
        },
        productEvidence: { createMany: jest.fn() },
        $transaction: jest.fn(async (work) => work(tx)),
    };
    const service = new ProductsService(
        prisma as unknown as PrismaService,
        {} as ProductStorageService,
        {} as ProductPhotoService,
    );

    const result = await service.save("seller", dto, [], current.id);

    expect(tx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
            data: expect.objectContaining({
                title: dto.title,
                price: dto.price,
                status: "published",
                reviewStatus: "approved",
            }),
        }),
    );
    expect(tx.productReview.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
            where: { id: "review", status: "seller_confirmation" },
            data: { status: "approved" },
        }),
    );
    expect(result.reviewStatus).toBe("approved");
});
