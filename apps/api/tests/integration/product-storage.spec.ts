import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProductStorageService } from "../../src/storage/product-storage.service";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fakeR2 = require("../helpers/r2-server.cjs");

describe("R2 product photo storage", () => {
    let server: Awaited<ReturnType<typeof fakeR2>>;
    let storage: ProductStorageService;
    let previous: NodeJS.ProcessEnv;
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    beforeEach(async () => {
        previous = { ...process.env };
        server = await fakeR2();
        Object.assign(process.env, server.env, {
            NODE_ENV: "test",
            PRODUCT_STORAGE_DRIVER: "r2",
            R2_KEY_PREFIX: "products",
        });
        storage = new ProductStorageService();
    });
    afterEach(async () => {
        storage.onModuleDestroy();
        await server.close();
        process.env = previous;
    });
    it("uses signed S3 PUT/GET/DELETE and keeps bytes outside the API filesystem", async () => {
        const bytes = Buffer.from("isolated WebP bytes");
        const key = await storage.put(id, bytes);
        expect(key).toBe(`r2:products/${id}.webp`);
        expect(await storage.read(key)).toEqual(bytes);
        expect(
            server.requests.map((r: { method: string }) => r.method),
        ).toEqual(["PUT", "GET"]);
        expect(server.requests[0].contentType).toBe("image/webp");
        await storage.delete(key);
        expect(server.objects.size).toBe(0);
        await expect(storage.read(key)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
    it("fails closed if R2 credentials are absent", async () => {
        delete process.env.R2_SECRET_ACCESS_KEY;
        await expect(
            storage.put(id, Buffer.from("photo")),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(server.requests).toHaveLength(0);
    });
    it("never sends credentials to an arbitrary endpoint", async () => {
        process.env.R2_ENDPOINT = "https://example.com";
        await expect(
            storage.put(id, Buffer.from("photo")),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(server.requests).toHaveLength(0);
    });
    it("does not permit the HTTP fixture or local write driver outside tests", async () => {
        process.env.NODE_ENV = "production";
        process.env.PRODUCT_STORAGE_DRIVER = "local";
        await expect(
            storage.put(id, Buffer.from("photo")),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
    it("preserves old local photos while rejecting path traversal", async () => {
        const directory = await mkdtemp(join(tmpdir(), "reown-legacy-photo-"));
        try {
            process.env.PRODUCT_UPLOAD_DIR = directory;
            const bytes = Buffer.from("old image");
            await writeFile(join(directory, `${id}.webp`), bytes);
            expect(await storage.read(`${id}.webp`)).toEqual(bytes);
            await expect(storage.read("../../.env")).rejects.toBeInstanceOf(
                NotFoundException,
            );
            await storage.delete(`${id}.webp`);
            await expect(storage.read(`${id}.webp`)).rejects.toBeInstanceOf(
                NotFoundException,
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
