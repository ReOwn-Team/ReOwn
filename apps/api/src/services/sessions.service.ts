import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import {
    REFRESH_TOKEN_TTL_SECONDS,
    type SessionGrant,
} from "../models/session.model";
import { ACTIVE_USER_STATUS } from "../models/user.model";
import { PrismaService } from "../prisma/prisma.service";

export {
    REFRESH_TOKEN_TTL_SECONDS,
    type SessionGrant,
} from "../models/session.model";

const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class SessionsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: string): Promise<SessionGrant> {
        const familyId = randomUUID();
        const refreshToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(
            Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
        );

        await this.prisma.session.create({
            data: {
                id: familyId,
                familyId,
                userId,
                refreshTokenHash: this.hash(refreshToken),
                expiresAt,
            },
        });

        return { userId, familyId, refreshToken, expiresAt };
    }

    async rotate(rawToken: string): Promise<SessionGrant> {
        if (!this.isWellFormed(rawToken)) {
            throw new UnauthorizedException();
        }

        const refreshTokenHash = this.hash(rawToken);
        const existing = await this.prisma.session.findUnique({
            where: { refreshTokenHash },
            select: { familyId: true },
        });
        if (!existing) {
            throw new UnauthorizedException();
        }

        const grant = await this.prisma.$transaction(
            async (tx) => {
                await this.lockFamily(tx, existing.familyId);
                const session = await tx.session.findUnique({
                    where: { refreshTokenHash },
                    select: {
                        id: true,
                        userId: true,
                        familyId: true,
                        expiresAt: true,
                        revokedAt: true,
                        user: { select: { status: true } },
                    },
                });
                const now = new Date();

                if (
                    !session ||
                    session.familyId !== existing.familyId ||
                    session.revokedAt !== null ||
                    session.expiresAt <= now ||
                    session.user.status !== ACTIVE_USER_STATUS
                ) {
                    await this.revokeFamily(tx, existing.familyId, now);
                    // Returning allows replay revocation to commit before the 401 is thrown.
                    return null;
                }

                await tx.session.update({
                    where: { id: session.id },
                    data: { revokedAt: now, lastUsedAt: now },
                });
                const refreshToken = randomBytes(32).toString("base64url");
                await tx.session.create({
                    data: {
                        id: randomUUID(),
                        familyId: session.familyId,
                        userId: session.userId,
                        refreshTokenHash: this.hash(refreshToken),
                        expiresAt: session.expiresAt,
                    },
                });

                return {
                    userId: session.userId,
                    familyId: session.familyId,
                    refreshToken,
                    expiresAt: session.expiresAt,
                };
            },
            { isolationLevel: "ReadCommitted" },
        );

        if (!grant) {
            throw new UnauthorizedException();
        }
        return grant;
    }

    async revoke(rawToken: string): Promise<void> {
        if (!this.isWellFormed(rawToken)) {
            return;
        }

        const existing = await this.prisma.session.findUnique({
            where: { refreshTokenHash: this.hash(rawToken) },
            select: { familyId: true },
        });
        if (!existing) {
            return;
        }

        await this.prisma.$transaction(
            async (tx) => {
                await this.lockFamily(tx, existing.familyId);
                await this.revokeFamily(tx, existing.familyId, new Date());
            },
            { isolationLevel: "ReadCommitted" },
        );
    }

    async assertActive(userId: string, familyId: string): Promise<void> {
        const session = await this.prisma.session.findFirst({
            where: {
                familyId,
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            select: { id: true },
        });
        if (!session) {
            throw new UnauthorizedException();
        }
    }

    private isWellFormed(rawToken: string): boolean {
        return (
            typeof rawToken === "string" &&
            rawToken.length === 43 &&
            REFRESH_TOKEN_PATTERN.test(rawToken)
        );
    }

    private hash(rawToken: string): string {
        return createHash("sha256").update(rawToken).digest("hex");
    }

    private async lockFamily(
        tx: Prisma.TransactionClient,
        familyId: string,
    ): Promise<void> {
        // Cast PostgreSQL's void result so Prisma can deserialize the raw query result.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}::text, 0))::text`;
    }

    private async revokeFamily(
        tx: Prisma.TransactionClient,
        familyId: string,
        now: Date,
    ): Promise<void> {
        await tx.session.updateMany({
            where: { familyId, revokedAt: null },
            data: { revokedAt: now },
        });
    }
}
