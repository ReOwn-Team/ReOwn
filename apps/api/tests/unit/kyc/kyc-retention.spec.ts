import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { KycService } from "../../../src/services/kyc.service";

function setup() {
    const prisma = {
        kycSubmission: {
            findMany: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
            updateMany: jest
                .fn<(...args: any[]) => any>()
                .mockResolvedValue({ count: 1 }),
        },
        kycAsset: {
            deleteMany: jest
                .fn<(...args: any[]) => any>()
                .mockResolvedValue({}),
        },
        user: {
            update: jest.fn<(...args: any[]) => any>().mockResolvedValue({}),
        },
        auditLog: {
            create: jest.fn<(...args: any[]) => any>().mockResolvedValue({}),
        },
        $queryRaw: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
        $transaction: jest.fn<(...args: any[]) => any>(),
    };
    prisma.$transaction.mockImplementation(async (work: any) => work(prisma));
    return {
        prisma,
        service: new KycService(prisma as any, {} as any, {} as any),
    };
}

describe("KYC retention", () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it("drains batches and counts only successful claims when a decision wins", async () => {
        const { prisma, service } = setup();
        const rows = Array.from({ length: 100 }, (_, i) => ({
            id: String(i),
            userId: String(i),
        }));
        prisma.kycSubmission.findMany
            .mockResolvedValueOnce(rows)
            .mockResolvedValueOnce([{ id: "last", userId: "last" }]);
        prisma.kycSubmission.updateMany.mockResolvedValueOnce({ count: 0 });
        const now = new Date("2026-11-01T00:00:00Z");
        await expect(service.purgeStale(now)).resolves.toBe(100);
        expect(prisma.kycSubmission.findMany).toHaveBeenCalledTimes(2);
        expect(
            prisma.kycSubmission.findMany.mock.calls[1][0].where.createdAt.lt,
        ).toEqual(new Date("2026-10-18T00:00:00Z"));
        expect(prisma.kycAsset.deleteMany).toHaveBeenCalledTimes(100);
        expect(prisma.user.update).toHaveBeenCalledTimes(100);
        expect(prisma.auditLog.create).toHaveBeenCalledTimes(100);
        expect(prisma.kycAsset.deleteMany).not.toHaveBeenCalledWith({
            where: { submissionId: "0" },
        });
    });

    it("runs at startup, skips overlapping ticks, logs failures and retries", async () => {
        jest.useFakeTimers();
        const { service } = setup();
        const env = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        let reject!: (error: Error) => void;
        const purge = jest
            .spyOn(service, "purgeStale")
            .mockImplementationOnce(
                () =>
                    new Promise<number>((_, fail) => {
                        reject = fail;
                    }),
            )
            .mockResolvedValue(0);
        const logger = jest
            .spyOn((service as any).logger, "error")
            .mockImplementation(() => {});
        try {
            service.onModuleInit();
            expect(purge).toHaveBeenCalledTimes(1);
            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(purge).toHaveBeenCalledTimes(1);
            reject(new Error("database unavailable"));
            await Promise.resolve();
            await Promise.resolve();
            expect(logger).toHaveBeenCalledWith("KYC retention sweep failed");
            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(purge).toHaveBeenCalledTimes(2);
            service.onModuleDestroy();
            jest.advanceTimersByTime(60 * 60 * 1000);
            expect(purge).toHaveBeenCalledTimes(2);
        } finally {
            service.onModuleDestroy();
            process.env.NODE_ENV = env;
        }
    });
});
