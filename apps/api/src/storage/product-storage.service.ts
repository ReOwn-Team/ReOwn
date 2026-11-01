import {
    Injectable,
    NotFoundException,
    OnModuleDestroy,
    ServiceUnavailableException,
} from "@nestjs/common";
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

@Injectable()
export class ProductStorageService implements OnModuleDestroy {
    private client?: S3Client;
    private configuration?: { bucket: string; prefix: string };
    private directory() {
        return resolve(
            process.env.PRODUCT_UPLOAD_DIR ?? ".data/product-images",
        );
    }
    private local() {
        return (
            process.env.PRODUCT_STORAGE_DRIVER === "local" &&
            process.env.NODE_ENV === "test"
        );
    }
    private r2() {
        if (this.client && this.configuration)
            return { client: this.client, ...this.configuration };
        const account = process.env.R2_ACCOUNT_ID;
        const bucket = process.env.R2_BUCKET;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const prefix =
            (process.env.R2_KEY_PREFIX ?? "products").replace(/\/+$/, "") + "/";
        const endpoint =
            process.env.R2_ENDPOINT ??
            `https://${account}.r2.cloudflarestorage.com`;
        let allowedEndpoint = false;
        try {
            const url = new URL(endpoint);
            allowedEndpoint =
                url.protocol === "https:" &&
                url.hostname === `${account}.r2.cloudflarestorage.com` &&
                url.pathname === "/" &&
                !url.search &&
                !url.username &&
                !url.password;
            if (
                process.env.NODE_ENV === "test" &&
                ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
                url.protocol === "http:" &&
                url.pathname === "/"
            )
                allowedEndpoint = true;
        } catch {
            /* Validate configuration without exposing credentials. */
        }
        if (
            !account ||
            !/^[a-f0-9]{32}$/i.test(account) ||
            !bucket ||
            !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
            !accessKeyId ||
            !secretAccessKey ||
            !/^[a-zA-Z0-9/_-]{1,160}\/$/.test(prefix) ||
            !allowedEndpoint
        )
            throw new ServiceUnavailableException(
                "R2 image storage is not configured",
            );
        this.client = new S3Client({
            region: "auto",
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey },
            maxAttempts: 2,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
        });
        this.configuration = { bucket, prefix };
        return { client: this.client, ...this.configuration };
    }
    async put(id: string, bytes: Buffer): Promise<string> {
        if (!/^[a-f0-9-]{36}$/i.test(id))
            throw new Error("Invalid image identifier");
        if (this.local()) {
            await mkdir(this.directory(), { recursive: true });
            await writeFile(resolve(this.directory(), `${id}.webp`), bytes, {
                flag: "wx",
                mode: 0o600,
            });
            return `local:${id}.webp`;
        }
        const { client, bucket, prefix } = this.r2();
        const key = `${prefix}${id}.webp`;
        try {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: bytes,
                    ContentType: "image/webp",
                    CacheControl: "public, max-age=3600",
                }),
                { abortSignal: AbortSignal.timeout(10000) },
            );
            return `r2:${key}`;
        } catch {
            // A lost PUT response may still have created the object. It cannot
            // be referenced by a product yet, so best-effort cleanup is safe.
            await client
                .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
                    abortSignal: AbortSignal.timeout(10000),
                })
                .catch(() => {});
            throw new ServiceUnavailableException(
                "Cannot upload product photo to R2",
            );
        }
    }
    originalKey(id: string): string {
        if (!/^[a-f0-9-]{36}$/i.test(id))
            throw new Error("Invalid image identifier");
        return this.local()
            ? `local:${id}.bin`
            : `r2:${this.r2().prefix}originals/${id}.bin`;
    }
    async putOriginal(id: string, bytes: Buffer): Promise<string> {
        if (!/^[a-f0-9-]{36}$/i.test(id))
            throw new Error("Invalid image identifier");
        if (this.local()) {
            await mkdir(this.directory(), { recursive: true });
            await writeFile(resolve(this.directory(), `${id}.bin`), bytes, {
                flag: "wx",
                mode: 0o600,
            });
            return `local:${id}.bin`;
        }
        const { client, bucket, prefix } = this.r2();
        const key = `${prefix}originals/${id}.bin`;
        try {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: bytes,
                    ContentType: "application/octet-stream",
                    CacheControl: "private, no-store",
                }),
                { abortSignal: AbortSignal.timeout(10000) },
            );
        } catch {
            await client
                .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
                    abortSignal: AbortSignal.timeout(10000),
                })
                .catch(() => {});
            throw new ServiceUnavailableException(
                "Cannot store original photo",
            );
        }
        return `r2:${key}`;
    }
    private objectKey(key: string) {
        if (!/^r2:[a-zA-Z0-9/_-]+\/[a-f0-9-]{36}\.(?:webp|bin)$/.test(key))
            throw new NotFoundException();
        return key.slice(3);
    }
    private legacyKey(key: string) {
        const filename = key.replace(/^local:/, "");
        if (!/^[a-f0-9-]{36}\.(?:webp|bin)$/.test(filename))
            throw new NotFoundException();
        return filename;
    }
    async read(key: string): Promise<Buffer> {
        if (!key.startsWith("r2:")) {
            try {
                return await readFile(
                    resolve(this.directory(), this.legacyKey(key)),
                );
            } catch (error) {
                if (
                    error instanceof NotFoundException ||
                    (error as NodeJS.ErrnoException).code === "ENOENT"
                )
                    throw new NotFoundException();
                throw new ServiceUnavailableException(
                    "Cannot read legacy product photo",
                );
            }
        }
        const objectKey = this.objectKey(key);
        const { client, bucket } = this.r2();
        try {
            const result = await client.send(
                new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
                { abortSignal: AbortSignal.timeout(10000) },
            );
            if (!result.Body) throw new NotFoundException();
            return Buffer.from(await result.Body.transformToByteArray());
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                (error as { name?: string }).name === "NoSuchKey" ||
                (error as { $metadata?: { httpStatusCode?: number } }).$metadata
                    ?.httpStatusCode === 404
            )
                throw new NotFoundException();
            throw new ServiceUnavailableException(
                "Cannot read product photo from R2",
            );
        }
    }
    async delete(key: string) {
        if (!key.startsWith("r2:")) {
            try {
                await unlink(resolve(this.directory(), this.legacyKey(key)));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                    throw error;
            }
            return;
        }
        const objectKey = this.objectKey(key);
        const { client, bucket } = this.r2();
        try {
            await client.send(
                new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
                { abortSignal: AbortSignal.timeout(10000) },
            );
        } catch {
            throw new ServiceUnavailableException(
                "Cannot delete product photo from R2",
            );
        }
    }
    onModuleDestroy() {
        this.client?.destroy();
    }
}
