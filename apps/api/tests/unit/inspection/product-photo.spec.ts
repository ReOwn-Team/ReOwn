import sharp from "sharp";
import { ProductPhotoService } from "../../../src/inspection/product-photo.service";
import { photoMetadata } from "../../../src/inspection/photo-metadata";
const fixture = require("../../helpers/photo-fixture.cjs");
describe("Product originals", () => {
    it("extracts capture metadata before stripping it from the public derivative", async () => {
        const bytes = await fixture();
        const result = await new ProductPhotoService().prepare(bytes, 0);
        expect(result.metadata).toMatchObject({
            capturedAtLocal: "2026:10:31 10:00:00",
            utcOffset: "+07:00",
            latitude: 10,
            longitude: 106,
        });
        const publicMetadata = await sharp(result.bytes).metadata();
        expect(publicMetadata.format).toBe("webp");
        expect(publicMetadata.exif).toBeUndefined();
        expect(result.originalMime).toBe("image/jpeg");
    });
    it.each([{ gps: false }, { date: false }])(
        "rejects missing metadata %j with the image index",
        async (options) => {
            const bytes = await fixture(options);
            try {
                await photoMetadata(bytes, 2);
                throw Error("accepted invalid metadata");
            } catch (error) {
                expect(
                    (error as { getResponse: () => unknown }).getResponse(),
                ).toMatchObject({
                    error: "PRODUCT_PHOTO_INVALID",
                    imageIndex: 2,
                    code: "METADATA_REQUIRED",
                });
            }
        },
    );
    it("does not invent timezone information", async () => {
        expect(
            (await photoMetadata(await fixture({ offset: false }), 0))
                .utcOffset,
        ).toBeNull();
    });
    it("rejects an image without EXIF rather than substituting upload time", async () => {
        const bytes = await sharp({
            create: { width: 20, height: 20, channels: 3, background: "white" },
        })
            .png()
            .toBuffer();
        await expect(photoMetadata(bytes, 0)).rejects.toThrow();
    });
    it("enforces the input byte limit before attempting to parse", async () => {
        await expect(
            new ProductPhotoService().prepare(
                Buffer.alloc(5 * 1024 * 1024 + 1),
                0,
            ),
        ).rejects.toThrow();
    });
});

it("decodes an actual iPhone HEIC with capture metadata in the packaged worker", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const bytes = readFileSync(
        resolve(__dirname, "../../fixtures/iphone7.heic"),
    );
    const photo = await new ProductPhotoService().prepare(bytes, 0);
    expect(photo.originalMime).toBe("image/heic");
    expect(photo.metadata.capturedAtLocal).toMatch(/^\d{4}:/);
    expect(Number.isFinite(photo.metadata.latitude)).toBe(true);
    expect((await sharp(photo.bytes).metadata()).format).toBe("webp");
}, 20000);
