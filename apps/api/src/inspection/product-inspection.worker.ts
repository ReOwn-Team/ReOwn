import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ProductStorageService } from "../storage/product-storage.service";
import {
    PRODUCT_INSPECTION_PROVIDER,
    InspectionFailure,
    type ProductInspectionProvider,
    type InspectionSnapshot,
} from "./inspection-report";
@Injectable()
export class ProductInspectionWorker implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ProductInspectionWorker.name);
    private queue?: Queue;
    private worker?: Worker;
    private timer?: ReturnType<typeof setInterval>;
    private scanning = false;
    private lastConnectionWarning = 0;
    private cleanupTimer?: ReturnType<typeof setInterval>;
    private purging = false;
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: ProductStorageService,
        @Inject(PRODUCT_INSPECTION_PROVIDER)
        private readonly provider: ProductInspectionProvider,
    ) {}
    onModuleInit() {
        if (
            process.env.INSPECTION_WORKER_ENABLED === "false" ||
            (process.env.NODE_ENV === "test" &&
                process.env.INSPECTION_WORKER_ENABLED !== "true")
        )
            return;
        const cleanup = () => {
            if (this.purging) return;
            this.purging = true;
            void this.purge()
                .catch(() =>
                    this.logger.warn(
                        "Original cleanup unavailable; retry scheduled",
                    ),
                )
                .finally(() => {
                    this.purging = false;
                });
        };
        this.cleanupTimer = setInterval(cleanup, 60000);
        this.cleanupTimer.unref();
        cleanup();
        if (!process.env.REDIS_URL) {
            this.logger.warn(
                "Inspection queue unavailable; persisted requests remain queued",
            );
            return;
        }
        const url = new URL(process.env.REDIS_URL);
        const connection = {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username
                ? decodeURIComponent(url.username)
                : undefined,
            password: url.password
                ? decodeURIComponent(url.password)
                : undefined,
            db: Number(url.pathname.slice(1) || 0),
            ...(url.protocol === "rediss:" ? { tls: {} } : {}),
            connectTimeout: 3000,
            maxRetriesPerRequest: null,
        };
        const prefix = `${process.env.REDIS_KEY_PREFIX ?? "reown:"}inspection`;
        this.queue = new Queue("product-inspection", { connection, prefix });
        this.worker = new Worker(
            "product-inspection",
            (job) => this.run(String(job.data.id)),
            { connection, prefix, concurrency: 1 },
        );
        this.queue.on("error", () => this.connectionWarning());
        this.worker.on("error", () => this.connectionWarning());
        this.worker.on("failed", () =>
            this.logger.warn(
                "Inspection job failed; reconciliation will recover persisted work",
            ),
        );
        this.timer = setInterval(() => void this.reconcile(), 60000);
        this.timer.unref();
        void this.reconcile();
    }
    private connectionWarning() {
        if (Date.now() - this.lastConnectionWarning > 60000) {
            this.lastConnectionWarning = Date.now();
            this.logger.warn(
                "Inspection queue connection unavailable; persisted work will be retried",
            );
        }
    }
    async reconcile() {
        if (this.scanning) return;
        this.scanning = true;
        try {
            await this.prisma.productInspection.updateMany({
                where: {
                    status: "processing",
                    attempts: { gte: 3 },
                    updatedAt: { lt: new Date(Date.now() - 300000) },
                },
                data: { status: "failed", errorCode: "AI_WORKER_INTERRUPTED" },
            });
            await this.prisma.productInspection.updateMany({
                where: {
                    status: "processing",
                    updatedAt: { lt: new Date(Date.now() - 300000) },
                },
                data: { status: "queued" },
            });
            const jobs = await this.prisma.productInspection.findMany({
                where: { status: "queued", nextAttemptAt: { lte: new Date() } },
                orderBy: { createdAt: "asc" },
                take: 50,
                select: { id: true, attempts: true },
            });
            for (const job of jobs)
                await this.queue?.add(
                    "inspect",
                    { id: job.id },
                    {
                        jobId: `${job.id}-${job.attempts}`,
                        removeOnComplete: true,
                        removeOnFail: true,
                    },
                );
        } catch {
            this.logger.warn(
                "Inspection reconciliation failed; retry scheduled",
            );
        } finally {
            this.scanning = false;
        }
    }
    async run(id: string) {
        const claim = await this.prisma.productInspection.updateMany({
            where: { id, status: "queued", nextAttemptAt: { lte: new Date() } },
            data: { status: "processing", attempts: { increment: 1 } },
        });
        if (!claim.count) return;
        const inspection =
            await this.prisma.productInspection.findUniqueOrThrow({
                where: { id },
                include: {
                    review: {
                        include: {
                            product: {
                                select: { revision: true, deletedAt: true },
                            },
                        },
                    },
                },
            });
        const where = {
            id,
            status: "processing",
            attempts: inspection.attempts,
        };
        if (
            inspection.review.product.deletedAt ||
            inspection.review.revision !== inspection.review.product.revision
        ) {
            await this.prisma.productInspection.updateMany({
                where,
                data: { status: "cancelled", errorCode: "STALE_REVISION" },
            });
            return;
        }
        try {
            const snapshot = inspection.review
                .snapshot as unknown as InspectionSnapshot;
            const images = [];
            for (const image of snapshot.images)
                images.push({
                    id: image.id,
                    bytes: await this.storage.read(image.objectKey),
                });
            const result = await this.provider.inspect(
                snapshot,
                images,
                inspection.promptVersion,
            );
            const current = await this.prisma.product.findUnique({
                where: { id: inspection.review.productId },
                select: { revision: true, deletedAt: true },
            });
            await this.prisma.productInspection.updateMany({
                where,
                data:
                    !current ||
                    current.deletedAt ||
                    current.revision !== inspection.review.revision
                        ? { status: "cancelled", errorCode: "STALE_REVISION" }
                        : {
                              status: "completed",
                              report: result.report,
                              model: result.model,
                              errorCode: null,
                          },
            });
        } catch (error) {
            const failure =
                error instanceof InspectionFailure
                    ? error
                    : new InspectionFailure("AI_IMAGE_UNAVAILABLE", true);
            const retry = failure.retryable && inspection.attempts < 3;
            this.logger.warn(
                `Inspection ${id} failed: code=${failure.code} http=${failure.httpStatus ?? "none"} stage=${failure.stage ?? "provider"} attempt=${inspection.attempts} retry=${retry}`,
            );
            const delay = Math.max(
                failure.retryAfterSeconds ?? 0,
                [60, 300, 900][inspection.attempts - 1] ?? 900,
            );
            await this.prisma.productInspection.updateMany({
                where,
                data: {
                    status: retry ? "queued" : "failed",
                    errorCode: failure.code,
                    nextAttemptAt: new Date(Date.now() + delay * 1000),
                },
            });
        }
    }
    async purge() {
        const rows = await this.prisma.productEvidence.findMany({
            where: {
                expiresAt: { lte: new Date() },
                purgedAt: null,
                originalKey: { not: null },
            },
            take: 100,
            orderBy: { expiresAt: "asc" },
        });
        for (const row of rows) {
            try {
                await this.storage.delete(row.originalKey!);
                await this.prisma.productEvidence.updateMany({
                    where: { id: row.id, originalKey: row.originalKey },
                    data: { originalKey: null, purgedAt: new Date() },
                });
            } catch {
                this.logger.warn(
                    "Original photo cleanup failed; retry scheduled",
                );
            }
        }
    }
    async onModuleDestroy() {
        clearInterval(this.timer);
        clearInterval(this.cleanupTimer);
        await this.worker?.close(true);
        await this.queue?.close();
    }
}
