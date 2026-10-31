import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import type { Prisma } from "../../../src/generated/prisma/client";
import type { SessionGrant } from "../../../src/models/session.model";
import { PrismaService } from "../../../src/prisma/prisma.service";
import {
    REFRESH_TOKEN_TTL_SECONDS,
    SessionsService,
} from "../../../src/services/sessions.service";

const userId = "f47221b7-a23b-44bb-9c42-cfc153728910";
const familyId = "a0319d39-63f0-456b-8df1-40b9412af0ed";
const now = new Date("2026-10-27T12:00:00.000Z");
const expiresAt = new Date("2026-11-15T12:00:00.000Z");
const oldToken = "A".repeat(43);
const hash = (token: string) =>
    createHash("sha256").update(token).digest("hex");
const oldHash = hash(oldToken);
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const malformedTokens = [
    "",
    "short",
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}=`,
    `${"A".repeat(42)}+`,
    `${"A".repeat(42)}/`,
    `${oldToken}\n`,
    ` ${oldToken}`,
    undefined,
    null,
    123,
    {},
];

function activeSession() {
    return {
        id: familyId,
        userId,
        familyId,
        expiresAt,
        revokedAt: null as Date | null,
        user: { status: "active" },
    };
}

type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;
const mockQuery = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe("SessionsService", () => {
    let module: TestingModule;
    let service: SessionsService;
    let transactionEvents: string[];
    let transactionResults: unknown[];
    const tx = {
        $queryRaw: mockQuery(),
        session: {
            findUnique: mockQuery(),
            update: mockQuery(),
            create: mockQuery(),
            updateMany: mockQuery(),
        },
    };
    const prisma = {
        session: {
            create: mockQuery(),
            findUnique: mockQuery(),
            findFirst: mockQuery(),
        },
        $transaction:
            jest.fn<
                (
                    callback: TransactionCallback,
                    options?: unknown,
                ) => Promise<unknown>
            >(),
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        jest.useFakeTimers().setSystemTime(now);
        transactionEvents = [];
        transactionResults = [];
        prisma.session.create.mockResolvedValue({ id: familyId });
        prisma.session.findUnique.mockResolvedValue({ familyId });
        prisma.session.findFirst.mockResolvedValue({ id: familyId });
        tx.$queryRaw.mockResolvedValue([]);
        tx.session.findUnique.mockResolvedValue(activeSession());
        tx.session.update.mockResolvedValue({});
        tx.session.create.mockResolvedValue({});
        tx.session.updateMany.mockResolvedValue({ count: 1 });
        prisma.$transaction.mockImplementation(async (callback) => {
            transactionEvents.push("begin");
            try {
                const result = await callback(
                    tx as unknown as Prisma.TransactionClient,
                );
                transactionResults.push(result);
                transactionEvents.push("commit");
                return result;
            } catch (error) {
                transactionEvents.push("rollback");
                throw error;
            }
        });
        module = await Test.createTestingModule({
            providers: [SessionsService, PrismaService],
        })
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .compile();
        service = module.get(SessionsService);
    });

    afterEach(async () => {
        jest.useRealTimers();
        await module?.close();
    });

    function expectFamilyRevoked() {
        expect(tx.session.updateMany).toHaveBeenCalledWith({
            where: { familyId, revokedAt: null },
            data: { revokedAt: now },
        });
    }

    function expectParameterizedFamilyLock() {
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        const [strings, ...parameters] = tx.$queryRaw.mock.calls[0];
        expect((strings as TemplateStringsArray).join("?")).toBe(
            "SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))::text",
        );
        expect(parameters).toEqual([familyId]);
        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
            isolationLevel: "ReadCommitted",
        });
    }

    describe("create", () => {
        it("creates a UUID root family and stores only the hash of a 32-byte base64url secret", async () => {
            const grant = await service.create(userId);

            expect(REFRESH_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
            expect(grant).toEqual({
                userId,
                familyId: expect.stringMatching(uuidPattern),
                refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
                expiresAt: new Date(
                    now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
                ),
            });
            expect(Buffer.from(grant.refreshToken, "base64url")).toHaveLength(
                32,
            );
            expect(prisma.session.create).toHaveBeenCalledWith({
                data: {
                    id: grant.familyId,
                    familyId: grant.familyId,
                    userId,
                    refreshTokenHash: hash(grant.refreshToken),
                    expiresAt: grant.expiresAt,
                },
            });
            expect(
                JSON.stringify(prisma.session.create.mock.calls),
            ).not.toContain(grant.refreshToken);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("creates independent random families and tokens for separate logins", async () => {
            const first = await service.create(userId);
            const second = await service.create(userId);

            expect(second.familyId).not.toBe(first.familyId);
            expect(second.refreshToken).not.toBe(first.refreshToken);
        });

        it("does not return a grant if persistence fails", async () => {
            const error = new Error("Insert failed");
            prisma.session.create.mockRejectedValue(error);

            await expect(service.create(userId)).rejects.toBe(error);
        });
    });

    describe("rotate", () => {
        it.each(malformedTokens)(
            "rejects malformed token %p before any database access",
            async (rawToken) => {
                await expect(
                    service.rotate(rawToken as string),
                ).rejects.toBeInstanceOf(UnauthorizedException);

                expect(prisma.session.findUnique).not.toHaveBeenCalled();
                expect(prisma.$transaction).not.toHaveBeenCalled();
            },
        );

        it("returns the same generic 401 for unknown and malformed tokens", async () => {
            prisma.session.findUnique.mockResolvedValue(null);
            const unknownError = await service
                .rotate(oldToken)
                .catch((error: unknown) => error);
            const malformedError = await service
                .rotate("invalid")
                .catch((error: unknown) => error);

            expect(unknownError).toBeInstanceOf(UnauthorizedException);
            expect(
                (unknownError as UnauthorizedException).getResponse(),
            ).toEqual((malformedError as UnauthorizedException).getResponse());
            expect(prisma.session.findUnique).toHaveBeenCalledWith({
                where: { refreshTokenHash: oldHash },
                select: { familyId: true },
            });
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });

        it("locks and re-reads the old hash, retains the revoked row and issues an absolute-expiry successor", async () => {
            const grant = await service.rotate(oldToken);

            expectParameterizedFamilyLock();
            expect(tx.session.findUnique).toHaveBeenCalledWith({
                where: { refreshTokenHash: oldHash },
                select: {
                    id: true,
                    userId: true,
                    familyId: true,
                    expiresAt: true,
                    revokedAt: true,
                    user: { select: { status: true } },
                },
            });
            expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
                tx.session.findUnique.mock.invocationCallOrder[0],
            );
            expect(tx.session.update).toHaveBeenCalledWith({
                where: { id: familyId },
                data: { revokedAt: now, lastUsedAt: now },
            });
            expect(grant).toEqual({
                userId,
                familyId,
                expiresAt,
                refreshToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
            });
            expect(grant.refreshToken).not.toBe(oldToken);
            const { data } = tx.session.create.mock.calls[0][0] as {
                data: Prisma.SessionUncheckedCreateInput;
            };
            expect(data).toEqual({
                id: expect.stringMatching(uuidPattern),
                familyId,
                userId,
                expiresAt,
                refreshTokenHash: hash(grant.refreshToken),
            });
            expect(data.id).not.toBe(familyId);
            expect(data.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
            expect(data.refreshTokenHash).not.toBe(oldHash);
            expect(tx.session.update.mock.invocationCallOrder[0]).toBeLessThan(
                tx.session.create.mock.invocationCallOrder[0],
            );
            const calls = JSON.stringify([
                prisma.session.findUnique.mock.calls,
                tx.$queryRaw.mock.calls,
                tx.session.findUnique.mock.calls,
                tx.session.update.mock.calls,
                tx.session.create.mock.calls,
            ]);
            expect(calls).not.toContain(oldToken);
            expect(calls).not.toContain(grant.refreshToken);
            expect(tx.session.updateMany).not.toHaveBeenCalled();
            expect(transactionEvents).toEqual(["begin", "commit"]);
        });

        it("does not extend expiry even immediately before the absolute deadline", async () => {
            jest.setSystemTime(new Date(expiresAt.getTime() - 1));

            const grant = await service.rotate(oldToken);

            expect(grant.expiresAt).toEqual(expiresAt);
            expect(tx.session.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ expiresAt }),
            });
        });

        it.each([
            [
                "replay",
                {
                    ...activeSession(),
                    revokedAt: new Date(now.getTime() - 1000),
                },
            ],
            [
                "expired",
                { ...activeSession(), expiresAt: new Date(now.getTime() - 1) },
            ],
            ["expiry boundary", { ...activeSession(), expiresAt: now }],
            [
                "inactive user",
                { ...activeSession(), user: { status: "inactive" } },
            ],
            ["locked user", { ...activeSession(), user: { status: "locked" } }],
            ["deleted token row", null],
            [
                "changed family",
                {
                    ...activeSession(),
                    familyId: "b0319d39-63f0-456b-8df1-40b9412af0ed",
                },
            ],
        ])(
            "commits family revocation before returning 401 for %s",
            async (_label, session) => {
                tx.session.findUnique.mockResolvedValue(session);

                await expect(service.rotate(oldToken)).rejects.toBeInstanceOf(
                    UnauthorizedException,
                );

                expectParameterizedFamilyLock();
                expectFamilyRevoked();
                expect(transactionResults).toEqual([null]);
                expect(transactionEvents).toEqual(["begin", "commit"]);
                expect(tx.session.create).not.toHaveBeenCalled();
                expect(tx.session.update).not.toHaveBeenCalled();
            },
        );

        it("rejects the transaction callback when successor insertion fails, rather than committing old-token revocation", async () => {
            const error = new Error("Successor insert failed");
            tx.session.create.mockRejectedValue(error);

            await expect(service.rotate(oldToken)).rejects.toBe(error);

            expect(tx.session.update).toHaveBeenCalledTimes(1);
            expect(transactionResults).toEqual([]);
            expect(transactionEvents).toEqual(["begin", "rollback"]);
        });

        it("never inserts a successor if revoking the previous token fails", async () => {
            const error = new Error("Update failed");
            tx.session.update.mockRejectedValue(error);

            await expect(service.rotate(oldToken)).rejects.toBe(error);

            expect(tx.session.create).not.toHaveBeenCalled();
            expect(transactionEvents).toEqual(["begin", "rollback"]);
        });

        it("never reads or changes family rows if acquiring the lock fails", async () => {
            const error = new Error("Lock failed");
            tx.$queryRaw.mockRejectedValue(error);

            await expect(service.rotate(oldToken)).rejects.toBe(error);

            expect(tx.session.findUnique).not.toHaveBeenCalled();
            expect(tx.session.update).not.toHaveBeenCalled();
            expect(tx.session.create).not.toHaveBeenCalled();
            expect(tx.session.updateMany).not.toHaveBeenCalled();
            expect(transactionEvents).toEqual(["begin", "rollback"]);
        });

        it("does not mask failed replay revocation as a committed 401", async () => {
            const error = new Error("Family revocation failed");
            tx.session.findUnique.mockResolvedValue({
                ...activeSession(),
                revokedAt: now,
            });
            tx.session.updateMany.mockRejectedValue(error);

            await expect(service.rotate(oldToken)).rejects.toBe(error);

            expect(transactionEvents).toEqual(["begin", "rollback"]);
        });
    });

    describe("revoke", () => {
        it.each(malformedTokens)(
            "treats malformed logout token %p as a no-op without database access",
            async (rawToken) => {
                await expect(
                    service.revoke(rawToken as string),
                ).resolves.toBeUndefined();

                expect(prisma.session.findUnique).not.toHaveBeenCalled();
                expect(prisma.$transaction).not.toHaveBeenCalled();
            },
        );

        it("treats unknown tokens as an idempotent no-op", async () => {
            prisma.session.findUnique.mockResolvedValue(null);

            await expect(service.revoke(oldToken)).resolves.toBeUndefined();

            expect(prisma.session.findUnique).toHaveBeenCalledWith({
                where: { refreshTokenHash: oldHash },
                select: { familyId: true },
            });
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.session.create).not.toHaveBeenCalled();
        });

        it("uses an old token's family to revoke all live successors under the same lock without minting", async () => {
            await expect(service.revoke(oldToken)).resolves.toBeUndefined();

            expectParameterizedFamilyLock();
            expectFamilyRevoked();
            expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
                tx.session.updateMany.mock.invocationCallOrder[0],
            );
            expect(transactionEvents).toEqual(["begin", "commit"]);
            expect(tx.session.create).not.toHaveBeenCalled();
            expect(prisma.session.create).not.toHaveBeenCalled();
            expect(
                JSON.stringify(prisma.session.findUnique.mock.calls),
            ).not.toContain(oldToken);
        });

        it("succeeds repeatedly even when no family rows remain live", async () => {
            tx.session.updateMany.mockResolvedValue({ count: 0 });

            await service.revoke(oldToken);
            await expect(service.revoke(oldToken)).resolves.toBeUndefined();

            expect(tx.session.updateMany).toHaveBeenCalledTimes(2);
            expect(tx.session.create).not.toHaveBeenCalled();
        });

        it("propagates persistence failures rather than pretending logout succeeded", async () => {
            const error = new Error("Revoke failed");
            tx.session.updateMany.mockRejectedValue(error);

            await expect(service.revoke(oldToken)).rejects.toBe(error);

            expect(transactionEvents).toEqual(["begin", "rollback"]);
        });
    });

    describe("assertActive", () => {
        it("requires a matching user and family with an unrevoked, strictly unexpired row", async () => {
            await expect(
                service.assertActive(userId, familyId),
            ).resolves.toBeUndefined();

            expect(prisma.session.findFirst).toHaveBeenCalledWith({
                where: {
                    userId,
                    familyId,
                    revokedAt: null,
                    expiresAt: { gt: now },
                },
                select: { id: true },
            });
        });

        it("returns 401 when no active matching family exists", async () => {
            prisma.session.findFirst.mockResolvedValue(null);

            await expect(
                service.assertActive(userId, familyId),
            ).rejects.toBeInstanceOf(UnauthorizedException);
        });
    });

    it("fails closed for duplicate refreshes serialized by a simulated family lock (not a PostgreSQL integration test)", async () => {
        const rows = new Map([[oldHash, activeSession()]]);
        let lockQueue = Promise.resolve();
        let successorCount = 0;
        const lockEvents: string[] = [];
        prisma.$transaction.mockImplementation(async (callback) => {
            let release: (() => void) | undefined;
            const client = {
                $queryRaw: async (
                    _strings: TemplateStringsArray,
                    lockedFamilyId: string,
                ) => {
                    expect(lockedFamilyId).toBe(familyId);
                    const previous = lockQueue;
                    lockQueue = new Promise<void>((resolve) => {
                        release = resolve;
                    });
                    await previous;
                    lockEvents.push("acquired");
                    return [];
                },
                session: {
                    findUnique: async ({
                        where,
                    }: {
                        where: { refreshTokenHash: string };
                    }) => {
                        lockEvents.push("read");
                        const row = rows.get(where.refreshTokenHash);
                        return row ? { ...row } : null;
                    },
                    update: async ({
                        where,
                        data,
                    }: {
                        where: { id: string };
                        data: { revokedAt: Date };
                    }) => {
                        const row = [...rows.values()].find(
                            (candidate) => candidate.id === where.id,
                        )!;
                        row.revokedAt = data.revokedAt;
                        return row;
                    },
                    create: async ({
                        data,
                    }: {
                        data: {
                            id: string;
                            familyId: string;
                            userId: string;
                            expiresAt: Date;
                            refreshTokenHash: string;
                        };
                    }) => {
                        const { refreshTokenHash, ...fields } = data;
                        const row = {
                            ...fields,
                            revokedAt: null,
                            user: { status: "active" },
                        };
                        rows.set(refreshTokenHash, row);
                        successorCount += 1;
                        return row;
                    },
                    updateMany: async ({
                        where,
                        data,
                    }: {
                        where: { familyId: string };
                        data: { revokedAt: Date };
                    }) => {
                        for (const row of rows.values()) {
                            if (
                                row.familyId === where.familyId &&
                                row.revokedAt === null
                            ) {
                                row.revokedAt = data.revokedAt;
                            }
                        }
                        return { count: 1 };
                    },
                },
            };
            try {
                return await callback(
                    client as unknown as Prisma.TransactionClient,
                );
            } finally {
                lockEvents.push("released");
                release?.();
            }
        });
        prisma.session.findFirst.mockImplementation(async () => {
            const live = [...rows.values()].find(
                (row) => row.revokedAt === null,
            );
            return live ? { id: live.id } : null;
        });

        const results = await Promise.allSettled([
            service.rotate(oldToken),
            service.rotate(oldToken),
        ]);

        expect(results[0].status).toBe("fulfilled");
        expect(results[1]).toMatchObject({
            status: "rejected",
            reason: expect.any(UnauthorizedException),
        });
        expect(lockEvents).toEqual([
            "acquired",
            "read",
            "released",
            "acquired",
            "read",
            "released",
        ]);
        expect(successorCount).toBe(1);
        expect(rows.size).toBe(2);
        expect(rows.get(oldHash)?.revokedAt).toEqual(now);
        const first = (results[0] as PromiseFulfilledResult<SessionGrant>)
            .value;
        expect(rows.get(hash(first.refreshToken))?.revokedAt).toEqual(now);
        await expect(
            service.assertActive(userId, familyId),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
