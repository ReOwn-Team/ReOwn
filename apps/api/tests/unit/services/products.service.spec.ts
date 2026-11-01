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
