import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import sharp, { type Sharp } from "sharp";
import { photoError, photoMetadata } from "./photo-metadata";
@Injectable()
export class ProductPhotoService {
    private activeHeic = 0;
    private heicWaiters: Array<() => void> = [];
    private async acquireHeic() {
        if (this.activeHeic < 2) {
            this.activeHeic++;
            return;
        }
        if (this.heicWaiters.length >= 8)
            throw new ServiceUnavailableException(
                "Photo decoder is busy; please retry",
            );
        await new Promise<void>((resolve) => this.heicWaiters.push(resolve));
    }
    private releaseHeic() {
        const next = this.heicWaiters.shift();
        if (next) next();
        else this.activeHeic--;
    }

    async prepare(buffer: Buffer, imageIndex: number) {
        if (buffer.length > 5 * 1024 * 1024)
            throw photoError(imageIndex, "FILE_TOO_LARGE");
        const heic =
            buffer.length > 16 &&
            buffer.toString("ascii", 4, 8) === "ftyp" &&
            /heic|heix|hevc|hevx|mif1/.test(
                buffer.toString("ascii", 8, Math.min(buffer.length, 64)),
            );
        const metadata = await photoMetadata(buffer, imageIndex);
        let acquired = false;
        try {
            let image: Sharp;
            if (heic) {
                await this.acquireHeic();
                acquired = true;
                const decoded = await new Promise<{
                    width: number;
                    height: number;
                    data: Uint8Array;
                }>((resolve, reject) => {
                    const worker = new Worker(
                        join(__dirname, "workers/heic.cjs"),
                        {
                            workerData: buffer,
                            resourceLimits: { maxOldGenerationSizeMb: 256 },
                        },
                    );
                    let settled = false;
                    const finish = (
                        error: Error | null,
                        result?: {
                            width: number;
                            height: number;
                            data: Uint8Array;
                        },
                    ) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        void worker.terminate();
                        if (error) reject(error);
                        else resolve(result!);
                    };
                    const timer = setTimeout(
                        () => finish(new Error("HEIC timeout")),
                        15000,
                    );
                    worker.once("message", (result) =>
                        finish(
                            result.error ? new Error("HEIC invalid") : null,
                            result,
                        ),
                    );
                    worker.once("error", (error) => finish(error));
                    worker.once("exit", () =>
                        finish(new Error("HEIC decoder exited")),
                    );
                });
                // libheif applies HEIF orientation transforms; do not rotate again.
                image = sharp(Buffer.from(decoded.data), {
                    raw: {
                        width: decoded.width,
                        height: decoded.height,
                        channels: 4,
                    },
                    limitInputPixels: 40000000,
                });
            } else {
                image = sharp(buffer, {
                    limitInputPixels: 40000000,
                    animated: false,
                });
                const info = await image.metadata();
                if (
                    !["jpeg", "png", "webp"].includes(info.format ?? "") ||
                    (info.pages ?? 1) > 1
                )
                    throw Error();
                image = image.rotate();
            }
            const bytes = await image
                .resize({
                    width: 2000,
                    height: 2000,
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .webp({ quality: 85 })
                .toBuffer();
            return {
                bytes,
                metadata,
                originalMime: heic
                    ? "image/heic"
                    : `image/${(await sharp(buffer).metadata()).format}`,
            };
        } catch (error) {
            if (error instanceof ServiceUnavailableException) throw error;
            throw photoError(imageIndex, "IMAGE_DECODE_FAILED");
        } finally {
            if (acquired) this.releaseHeic();
        }
    }
}
