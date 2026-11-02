import {
    BadRequestException,
    ConflictException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleDestroy,
    OnModuleInit,
    UnprocessableEntityException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { UserProfile } from "../models/user.model";
import {
    KYC_CONSENT_VERSION,
    KycUserStatus,
    type KycDecision,
    type KycFlag,
} from "../dtos/kyc.dto";
import { KycCryptoService } from "../kyc/security/kyc-crypto.service";
import {
    KYC_ANALYZER,
    type KycAnalyzer,
} from "../kyc/analysis/kyc-analysis.service";
import type { AnalysisSuccess } from "../kyc/analysis/kyc-analyzer";
import { cohortStatus, nameSimilarity } from "../kyc/analysis/card-parser";

export type KycStatus =
    | "needs_review"
    | "verified"
    | "rejected"
    | "expired"
    | "withdrawn"
    | "superseded";
const ACTIVE: KycStatus[] = ["needs_review", "verified"];
const KINDS = ["card_front", "selfie"] as const;
export type KycAssetKind = (typeof KINDS)[number];

/** Attempts (including failed ones) allowed per user per rolling day. */
const DAILY_ATTEMPTS = 8;
/** Submissions nobody reviewed are wiped after this long. */
const REVIEW_TTL_DAYS = 14;

type Payload = {
    layout: string | null;
    fullName: string | null;
    dateOfBirth: string | null;
    major: string | null;
    cohort: { start: number; end: number } | null;
    studentId: string;
    studentIdSource: string;
};

const payloadAad = (id: string, userId: string) =>
    `kyc|payload|${id}|${userId}`;
const assetAad = (id: string, kind: string, userId: string) =>
    `kyc|asset|${id}|${kind}|${userId}`;

function isUniqueViolation(error: unknown) {
    const code = (error as { code?: string })?.code;
    const cause = (error as { cause?: { originalCode?: string } })?.cause;
    return code === "P2002" || cause?.originalCode === "23505";
}

@Injectable()
export class KycService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(KycService.name);
    private timer?: NodeJS.Timeout;

    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: KycCryptoService,
        @Inject(KYC_ANALYZER) private readonly analyzer: KycAnalyzer,
    ) {}

    onModuleInit() {
        if (process.env.NODE_ENV === "test") return;
        let running = false;
        const sweep = () => {
            if (running) return;
            running = true;
            void this.purgeStale()
                .catch(() => {
                    // Database errors can include sensitive values; do not log them.
                    this.logger.error("KYC retention sweep failed");
                })
                .finally(() => {
                    running = false;
                });
        };
        sweep();
        this.timer = setInterval(sweep, 60 * 60 * 1000);
        this.timer.unref();
    }
    onModuleDestroy() {
        if (this.timer) clearInterval(this.timer);
    }

    // ------------------------------------------------------------------
    // User-facing
    // ------------------------------------------------------------------
    async status(userId: string) {
        const latest = await this.prisma.kycSubmission.findFirst({
            where: { userId, status: { not: "withdrawn" } },
            orderBy: { createdAt: "desc" },
            select: {
                status: true,
                createdAt: true,
                reviewedAt: true,
                reason: true,
                consentVersion: true,
                sealedPayload: true,
            },
        });
        return {
            available: this.crypto.available() && this.analyzer.ready(),
            consentVersion: KYC_CONSENT_VERSION,
            status: (latest?.status ?? "none") as KycStatus | "none",
            submittedAt: latest?.createdAt.toISOString() ?? null,
            reviewedAt: latest?.reviewedAt?.toISOString() ?? null,
            // Only a reviewer-written rejection reason is shown to the user.
            reason: latest?.status === "rejected" ? latest.reason : null,
            // Evidence collected under the former deletion consent cannot be
            // recovered; ask the user to submit under the current consent.
            requiresReverification:
                latest?.status === "verified" &&
                (latest.consentVersion !== KYC_CONSENT_VERSION ||
                    latest.sealedPayload.length === 0),
        };
    }

    async submit(
        user: UserProfile,
        files: { front?: Buffer; selfie?: Buffer },
        requestId?: string,
    ) {
        if (!this.crypto.available() || !this.analyzer.ready())
            throw new HttpException(
                "KYC is not available",
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        if (!files.front || !files.selfie)
            throw new BadRequestException("Both photos are required");

        const reservation = await this.prisma.$transaction(async (tx) => {
            const [locked] = await tx.$queryRaw<
                Array<{ kyc_generation: number }>
            >`SELECT kyc_generation FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
            if (!locked) throw new NotFoundException("User not found");
            const existing = await tx.kycSubmission.findFirst({
                where: { userId: user.id, status: { in: ACTIVE } },
                select: {
                    id: true,
                    status: true,
                    consentVersion: true,
                    sealedPayload: true,
                },
            });
            const replaceLegacyVerified =
                existing?.status === "verified" &&
                existing.consentVersion !== undefined &&
                (existing.consentVersion !== KYC_CONSENT_VERSION ||
                    existing.sealedPayload.length === 0);
            if (existing && !replaceLegacyVerified)
                throw new ConflictException({
                    statusCode: 409,
                    error:
                        existing.status === "verified"
                            ? "KYC_ALREADY_VERIFIED"
                            : "KYC_ALREADY_PENDING",
                });

            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const attempts = await tx.auditLog.count({
                where: {
                    actorId: user.id,
                    action: "kyc.attempt",
                    createdAt: { gte: since },
                },
            });
            if (attempts >= DAILY_ATTEMPTS)
                throw new HttpException(
                    { statusCode: 429, error: "KYC_TOO_MANY_ATTEMPTS" },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            await tx.auditLog.create({
                data: {
                    actorId: user.id,
                    actorType: "user",
                    action: "kyc.attempt",
                    entityType: "user",
                    entityId: user.id,
                    metadata: {},
                    requestId,
                },
            });
            return {
                generation: locked.kyc_generation,
                legacyVerifiedId: replaceLegacyVerified ? existing!.id : null,
            };
        });

        const result = await this.analyzer.analyse({
            front: files.front,
            selfie: files.selfie,
        });
        if (!result.ok) {
            await this.audit(
                user.id,
                "user",
                "kyc.retake",
                "user",
                user.id,
                {
                    issues: result.issues,
                },
                requestId,
            );
            throw new UnprocessableEntityException({
                statusCode: 422,
                error: "KYC_RETAKE",
                issues: result.issues,
            });
        }
        const now = new Date();
        if (cohortStatus(result.card.cohort, now) === "expired")
            throw new UnprocessableEntityException({
                statusCode: 422,
                error: "KYC_CARD_EXPIRED",
            });

        const studentIdHmac = this.crypto.studentIdIndex(result.card.studentId);
        const taken = await this.prisma.kycSubmission.findFirst({
            where: {
                studentIdHmac,
                status: { in: ACTIVE },
                NOT: { userId: user.id },
            },
            select: { id: true },
        });
        if (taken)
            throw new ConflictException({
                statusCode: 409,
                error: "KYC_STUDENT_ID_IN_USE",
            });

        const id = randomUUID();
        const flags = this.flags(result, user.displayName, now);
        const payload: Payload = {
            layout: result.card.layout,
            fullName: result.card.fullName,
            dateOfBirth: result.card.dateOfBirth,
            major: result.card.major,
            cohort: result.card.cohort,
            studentId: result.card.studentId,
            studentIdSource: result.card.studentIdSource,
        };
        const images: Record<KycAssetKind, Buffer> = {
            card_front: Buffer.from(result.images.front),
            selfie: Buffer.from(result.images.selfie),
        };
        // Prepare encrypted data before taking the user row lock. Image bytes
        // can be large and must never be sent to the database unencrypted.
        const sealedPayload = new Uint8Array(
            this.crypto.seal(
                Buffer.from(JSON.stringify(payload)),
                payloadAad(id, user.id),
            ),
        );
        const assets = KINDS.map((kind) => ({
            kind,
            sealed: new Uint8Array(
                this.crypto.seal(images[kind], assetAad(id, kind, user.id)),
            ),
            sha256: createHash("sha256").update(images[kind]).digest("hex"),
            size: images[kind].length,
        }));
        try {
            await this.prisma.$transaction(
                async (tx) => {
                    const [locked] = await tx.$queryRaw<
                        Array<{ kyc_generation: number }>
                    >`SELECT kyc_generation FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
                    if (
                        !locked ||
                        locked.kyc_generation !== reservation.generation
                    )
                        throw new ConflictException(
                            "KYC submission was withdrawn",
                        );
                    const active = await tx.kycSubmission.findFirst({
                        where: { userId: user.id, status: { in: ACTIVE } },
                        select: {
                            id: true,
                            status: true,
                            consentVersion: true,
                            sealedPayload: true,
                        },
                    });
                    const canReplaceLegacy =
                        active !== null &&
                        active.id === reservation.legacyVerifiedId &&
                        active.status === "verified" &&
                        (active.consentVersion !== KYC_CONSENT_VERSION ||
                            active.sealedPayload.length === 0);
                    if (active && !canReplaceLegacy)
                        throw new ConflictException({
                            statusCode: 409,
                            error:
                                active.status === "verified"
                                    ? "KYC_ALREADY_VERIFIED"
                                    : "KYC_ALREADY_PENDING",
                        });
                    if (canReplaceLegacy)
                        await tx.kycSubmission.updateMany({
                            where: { id: active!.id, status: "verified" },
                            data: { status: "superseded" },
                        });
                    await tx.kycSubmission.create({
                        data: {
                            id,
                            userId: user.id,
                            status: "needs_review",
                            cardLayout: result.card.layout ?? "unknown",
                            studentIdHmac,
                            faceScore: result.faceScore,
                            flags,
                            sealedPayload,
                            consentVersion: KYC_CONSENT_VERSION,
                            consentedAt: now,
                            assets: { create: assets },
                        },
                    });
                    await tx.user.update({
                        where: { id: user.id },
                        data: { kycStatus: KycUserStatus.PENDING },
                    });
                    await tx.auditLog.create({
                        data: {
                            actorId: user.id,
                            actorType: "user",
                            action: "kyc.submitted",
                            entityType: "kyc_submission",
                            entityId: id,
                            metadata: { flags, consent: KYC_CONSENT_VERSION },
                            requestId,
                        },
                    });
                },
                { timeout: 30_000 },
            );
        } catch (error) {
            if (isUniqueViolation(error))
                throw new ConflictException({
                    statusCode: 409,
                    error: "KYC_STUDENT_ID_IN_USE",
                });
            throw error;
        }
        return { status: "needs_review" as const };
    }

    /** A user may withdraw only a review that is still awaiting a decision. */
    async withdraw(userId: string, requestId?: string) {
        await this.prisma.$transaction(async (tx) => {
            const [locked] = await tx.$queryRaw<
                Array<{ kyc_generation: number }>
            >`SELECT kyc_generation FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
            if (!locked) throw new NotFoundException("User not found");
            await tx.user.update({
                where: { id: userId },
                data: { kycGeneration: { increment: 1 } },
            });
            const active = await tx.kycSubmission.findFirst({
                where: { userId, status: "needs_review" },
                select: { id: true },
            });
            if (!active) return;
            const claimed = await tx.kycSubmission.updateMany({
                where: { id: active.id, userId, status: "needs_review" },
                data: {
                    status: "withdrawn",
                    sealedPayload: new Uint8Array(0),
                    purgedAt: new Date(),
                },
            });
            if (claimed.count !== 1)
                throw new ConflictException("KYC status changed; please retry");
            await tx.kycAsset.deleteMany({
                where: { submissionId: active.id },
            });
            await tx.user.update({
                where: { id: userId },
                data: { kycStatus: KycUserStatus.NONE },
            });
            await tx.auditLog.create({
                data: {
                    actorId: userId,
                    actorType: "user",
                    action: "kyc.withdrawn",
                    entityType: "kyc_submission",
                    entityId: active.id,
                    requestId,
                },
            });
        });
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------
    async list(cursor?: string) {
        const rows = await this.prisma.kycSubmission.findMany({
            where: { status: "needs_review" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 50,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
                id: true,
                createdAt: true,
                flags: true,
                faceScore: true,
                cardLayout: true,
                user: { select: { id: true, displayName: true, email: true } },
            },
        });
        return rows.map((row) => ({
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            flags: row.flags,
            faceScore: row.faceScore,
            cardLayout: row.cardLayout,
            user: row.user,
        }));
    }

    async detail(id: string, adminId: string, requestId?: string) {
        const row = await this.viewable(id);
        const payload = this.openPayload(row);
        await this.audit(
            adminId,
            "admin",
            "kyc.viewed",
            "kyc_submission",
            id,
            {},
            requestId,
        );
        return {
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            flags: row.flags,
            faceScore: row.faceScore,
            user: row.user,
            extracted: payload,
            assets: [...KINDS],
        };
    }

    async asset(id: string, kind: string, adminId: string, requestId?: string) {
        if (!KINDS.includes(kind as KycAssetKind))
            throw new NotFoundException();
        const row = await this.viewable(id);
        const asset = await this.prisma.kycAsset.findUnique({
            where: { submissionId_kind: { submissionId: id, kind } },
            select: { sealed: true },
        });
        if (!asset) throw new NotFoundException();
        let bytes: Buffer;
        try {
            bytes = this.crypto.open(
                Buffer.from(asset.sealed),
                assetAad(id, kind, row.userId),
            );
        } catch {
            throw new NotFoundException();
        }
        await this.audit(
            adminId,
            "admin",
            "kyc.asset_viewed",
            "kyc_submission",
            id,
            { kind },
            requestId,
        );
        return bytes;
    }

    async decide(
        id: string,
        adminId: string,
        decision: KycDecision,
        requestId?: string,
    ) {
        const row = await this.pending(id);

        const approve = decision.decision === "approve";
        // Never extend retention for a version of consent that promised deletion.
        const retainApprovedEvidence =
            approve && row.consentVersion === KYC_CONSENT_VERSION;
        let studentIdHmac = row.studentIdHmac;
        if (approve && decision.studentId) {
            studentIdHmac = this.crypto.studentIdIndex(decision.studentId);
            const taken = await this.prisma.kycSubmission.findFirst({
                where: {
                    studentIdHmac,
                    status: { in: ACTIVE },
                    NOT: { id },
                },
                select: { id: true },
            });
            if (taken)
                throw new ConflictException({
                    statusCode: 409,
                    error: "KYC_STUDENT_ID_IN_USE",
                });
        }
        const now = new Date();
        try {
            await this.prisma.$transaction(async (tx) => {
                // Serialize the user status with submission and withdrawal.
                await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.userId}::uuid FOR UPDATE`;
                const claimed = await tx.kycSubmission.updateMany({
                    where: { id, status: "needs_review" },
                    data: {
                        status: approve ? "verified" : "rejected",
                        studentIdHmac,
                        reviewedBy: adminId,
                        reviewedAt: now,
                        reason: approve ? null : (decision.reason ?? null),
                        // Only the current consent version permits retaining
                        // verified identity evidence for authorised repayment
                        // and dispute handling. Rejections are always purged.
                        ...(!retainApprovedEvidence
                            ? {
                                  sealedPayload: new Uint8Array(0),
                                  purgedAt: now,
                              }
                            : {}),
                    },
                });
                if (claimed.count !== 1) throw new ConflictException();
                if (!retainApprovedEvidence)
                    await tx.kycAsset.deleteMany({
                        where: { submissionId: id },
                    });
                await tx.user.update({
                    where: { id: row.userId },
                    data: {
                        kycStatus: approve
                            ? KycUserStatus.VERIFIED
                            : KycUserStatus.REJECTED,
                    },
                });
                await tx.auditLog.create({
                    data: {
                        actorId: adminId,
                        actorType: "admin",
                        action: approve ? "kyc.approved" : "kyc.rejected",
                        entityType: "kyc_submission",
                        entityId: id,
                        metadata: {
                            corrected: Boolean(approve && decision.studentId),
                            ...(approve ? {} : { reason: decision.reason }),
                        },
                        requestId,
                    },
                });
            });
        } catch (error) {
            if (isUniqueViolation(error))
                throw new ConflictException({
                    statusCode: 409,
                    error: "KYC_STUDENT_ID_IN_USE",
                });
            throw error;
        }
        return {
            status: approve ? ("verified" as const) : ("rejected" as const),
        };
    }

    /** Wipes reviews nobody completed in time. Safe to run repeatedly. */
    async purgeStale(now = new Date()) {
        const cutoff = new Date(now.getTime() - REVIEW_TTL_DAYS * 86_400_000);
        let expired = 0;
        let stale: { id: string; userId: string }[];
        do {
            stale = await this.prisma.kycSubmission.findMany({
                where: { status: "needs_review", createdAt: { lt: cutoff } },
                select: { id: true, userId: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 100,
            });
            for (const row of stale) {
                const claimed = await this.prisma.$transaction(async (tx) => {
                    // Use the same user-before-submission lock order as decisions and withdrawals.
                    await tx.$queryRaw`SELECT id FROM users WHERE id = ${row.userId}::uuid FOR UPDATE`;
                    const claimed = await tx.kycSubmission.updateMany({
                        where: { id: row.id, status: "needs_review" },
                        data: {
                            status: "expired",
                            sealedPayload: new Uint8Array(0),
                            purgedAt: now,
                        },
                    });
                    if (claimed.count !== 1) return false;
                    await tx.kycAsset.deleteMany({
                        where: { submissionId: row.id },
                    });
                    await tx.user.update({
                        where: { id: row.userId },
                        data: { kycStatus: KycUserStatus.NONE },
                    });
                    await tx.auditLog.create({
                        data: {
                            actorType: "system",
                            action: "kyc.expired",
                            entityType: "kyc_submission",
                            entityId: row.id,
                        },
                    });
                    return true;
                });
                if (claimed) expired++;
            }
            if (stale.length)
                this.logger.log(
                    `KYC retention sweep: ${expired} reviews expired so far`,
                );
        } while (stale.length === 100);
        return expired;
    }

    // ------------------------------------------------------------------
    private async pending(id: string) {
        const row = await this.prisma.kycSubmission.findFirst({
            where: { id, status: "needs_review" },
            select: {
                id: true,
                userId: true,
                createdAt: true,
                flags: true,
                faceScore: true,
                studentIdHmac: true,
                sealedPayload: true,
                consentVersion: true,
                user: { select: { id: true, displayName: true, email: true } },
            },
        });
        if (!row) throw new NotFoundException();
        return row;
    }

    /** Admin-only identity evidence retained for pending and verified KYC. */
    private async viewable(id: string) {
        const row = await this.prisma.kycSubmission.findFirst({
            where: { id, status: { in: ["needs_review", "verified"] } },
            select: {
                id: true,
                userId: true,
                createdAt: true,
                flags: true,
                faceScore: true,
                studentIdHmac: true,
                sealedPayload: true,
                user: { select: { id: true, displayName: true, email: true } },
            },
        });
        if (!row || row.sealedPayload.length === 0)
            throw new NotFoundException();
        return row;
    }

    private openPayload(row: {
        id: string;
        userId: string;
        sealedPayload: Uint8Array;
    }) {
        try {
            return JSON.parse(
                this.crypto
                    .open(
                        Buffer.from(row.sealedPayload),
                        payloadAad(row.id, row.userId),
                    )
                    .toString("utf8"),
            ) as Payload;
        } catch {
            throw new NotFoundException();
        }
    }

    private flags(
        result: AnalysisSuccess,
        displayName: string,
        now: Date,
    ): KycFlag[] {
        const flags: KycFlag[] = [];
        const { card } = result;
        if (result.faceBand === "low") flags.push("face_low_match");
        if (!card.fullName) flags.push("name_unreadable");
        else if (nameSimilarity(card.fullName, displayName) < 0.6)
            flags.push("name_mismatch");
        if (!card.dateOfBirth) flags.push("dob_unreadable");
        else {
            const age =
                (now.getTime() - new Date(card.dateOfBirth).getTime()) /
                (365.25 * 86_400_000);
            if (age < 16 || age > 45) flags.push("age_out_of_range");
        }
        if (!card.cohort) flags.push("cohort_unreadable");
        else {
            if (cohortStatus(card.cohort, now) === "not_started")
                flags.push("cohort_not_started");
        }
        if (card.studentIdSource === "ocr_single")
            flags.push("student_id_unverified");
        if (card.studentIdOcrConflict) flags.push("student_id_ocr_conflict");
        return flags;
    }

    private async audit(
        actorId: string,
        actorType: string,
        action: string,
        entityType: string,
        entityId: string,
        metadata: Record<string, unknown>,
        requestId?: string,
    ) {
        await this.prisma.auditLog.create({
            data: {
                actorId,
                actorType,
                action,
                entityType,
                entityId,
                metadata: metadata as object,
                requestId,
            },
        });
    }
}
