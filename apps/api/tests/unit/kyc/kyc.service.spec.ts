import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { KycService } from "../../../src/kyc/kyc.service";
import { KycCryptoService } from "../../../src/kyc/kyc-crypto.service";
import type { AnalysisResult } from "../../../src/kyc/kyc-analyzer";
import type { UserProfile } from "../../../src/models/user.model";

process.env.KYC_KEYS = `k1:${randomBytes(32).toString("base64")}`;
process.env.KYC_HMAC_KEY = randomBytes(32).toString("base64");

const user = {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Lê Văn Mẫu",
    kycStatus: 0,
    role: "user",
} as UserProfile;
const admin = { ...user, id: "22222222-2222-4222-8222-222222222222", role: "admin" } as UserProfile;
const front = Buffer.from("front-image-bytes");
const selfie = Buffer.from("selfie-image-bytes");
const STUDENT_ID = "2311223344";

function success(overrides: Partial<Extract<AnalysisResult, { ok: true }>["card"]> = {}, band: "match" | "low" = "match"): AnalysisResult {
    return {
        ok: true,
        card: {
            layout: "white",
            fullName: "Lê Văn Mẫu",
            dateOfBirth: "2007-12-31",
            major: "Kế toán",
            cohort: { start: 2022, end: 2030 },
            studentId: STUDENT_ID,
            studentIdSource: "barcode",
            studentIdOcrConflict: false,
            ...overrides,
        },
        faceScore: 0.7,
        faceBand: band,
        images: { front: Buffer.from("normalised-front"), selfie: Buffer.from("normalised-selfie") },
    };
}

function setup(result: AnalysisResult) {
    const prisma = {
        kycSubmission: {
            findFirst: jest.fn<(...args: any[]) => any>().mockResolvedValue(null),
            findMany: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
            create: jest.fn<(...args: any[]) => any>().mockResolvedValue({}),
            update: jest.fn<(...args: any[]) => any>().mockResolvedValue({}),
            updateMany: jest.fn<(...args: any[]) => any>().mockResolvedValue({ count: 1 }),
        },
        kycAsset: {
            findUnique: jest.fn<(...args: any[]) => any>(),
            deleteMany: jest.fn<(...args: any[]) => any>().mockResolvedValue({ count: 2 }),
        },
        auditLog: {
            count: jest.fn<(...args: any[]) => any>().mockResolvedValue(0),
            create: jest.fn<(...args: any[]) => any>().mockResolvedValue({}),
        },
        user: { update: jest.fn<(...args: any[]) => any>().mockResolvedValue({}) },
        $transaction: jest.fn<(...args: any[]) => any>(),
    };
    prisma.$transaction.mockImplementation(async (work: any) => work(prisma));
    const analyzer = {
        ready: jest.fn(() => true),
        analyse: jest.fn<(...args: any[]) => any>().mockResolvedValue(result),
    };
    const crypto = new KycCryptoService();
    const service = new KycService(prisma as any, crypto, analyzer as any);
    return { prisma, analyzer, crypto, service };
}

describe("KycService.submit", () => {
    it("asks for a retake without storing anything", async () => {
        const { service, prisma } = setup({ ok: false, issues: ["SELFIE_BLURRY"] });
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            status: 422,
            response: { error: "KYC_RETAKE", issues: ["SELFIE_BLURRY"] },
        });
        expect(prisma.kycSubmission.create).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("stores only ciphertext, indexes the card by HMAC and queues review", async () => {
        const { service, prisma, crypto } = setup(success());
        await expect(service.submit(user, { front, selfie })).resolves.toEqual({
            status: "needs_review",
        });
        const { data } = prisma.kycSubmission.create.mock.calls[0][0] as any;
        const everything = JSON.stringify(data);
        expect(everything).not.toContain(STUDENT_ID);
        expect(everything).not.toContain("Văn Mẫu");
        expect(data.studentIdHmac).toBe(crypto.studentIdIndex(STUDENT_ID));
        expect(data.flags).toEqual([]);
        expect(data.status).toBe("needs_review");
        const payload = JSON.parse(
            crypto
                .open(Buffer.from(data.sealedPayload), `kyc|payload|${data.id}|${user.id}`)
                .toString(),
        );
        expect(payload.studentId).toBe(STUDENT_ID);
        const frontAsset = data.assets.create.find((a: any) => a.kind === "card_front");
        expect(
            crypto
                .open(Buffer.from(frontAsset.sealed), `kyc|asset|${data.id}|card_front|${user.id}`)
                .toString(),
        ).toBe("normalised-front");
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: user.id },
            data: { kycStatus: 1 },
        });
        const audit = prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
        expect(audit).toEqual(expect.arrayContaining(["kyc.attempt", "kyc.submitted"]));
        expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(STUDENT_ID);
    });

    it("cannot be replayed onto another row (AAD binds user and submission)", async () => {
        const { service, prisma, crypto } = setup(success());
        await service.submit(user, { front, selfie });
        const { data } = prisma.kycSubmission.create.mock.calls[0][0] as any;
        expect(() =>
            crypto.open(Buffer.from(data.sealedPayload), `kyc|payload|${data.id}|${admin.id}`),
        ).toThrow();
    });

    it("flags weak signals for the reviewer", async () => {
        const { service, prisma } = setup(
            success(
                {
                    fullName: "Phạm Khác Hẳn",
                    studentIdSource: "ocr_single",
                    studentIdOcrConflict: true,
                    dateOfBirth: null,
                    cohort: { start: 2020, end: 2030 },
                },
                "low",
            ),
        );
        await service.submit(user, { front, selfie });
        const { data } = prisma.kycSubmission.create.mock.calls[0][0] as any;
        expect(data.flags).toEqual(
            expect.arrayContaining([
                "face_low_match",
                "name_mismatch",
                "dob_unreadable",
                "student_id_unverified",
                "student_id_ocr_conflict",
                "student_id_cohort_mismatch",
            ]),
        );
    });

    it("refuses an expired card", async () => {
        const { service, prisma } = setup(success({ cohort: { start: 2018, end: 2022 } }));
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            status: 422,
            response: { error: "KYC_CARD_EXPIRED" },
        });
        expect(prisma.kycSubmission.create).not.toHaveBeenCalled();
    });

    it("refuses a card already used by another account", async () => {
        const { service, prisma } = setup(success());
        prisma.kycSubmission.findFirst
            .mockResolvedValueOnce(null) // own active submission
            .mockResolvedValueOnce({ id: "x" }); // card taken
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            status: 409,
            response: { error: "KYC_STUDENT_ID_IN_USE" },
        });
        expect(prisma.kycSubmission.create).not.toHaveBeenCalled();
    });

    it("maps a database race on the unique index to the same conflict", async () => {
        const { service, prisma } = setup(success());
        prisma.kycSubmission.create.mockRejectedValue({ code: "P2002" });
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            status: 409,
        });
    });

    it("blocks a second submission while one is pending or verified", async () => {
        const { service, prisma, analyzer } = setup(success());
        prisma.kycSubmission.findFirst.mockResolvedValueOnce({ status: "verified" });
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            response: { error: "KYC_ALREADY_VERIFIED" },
        });
        expect(analyzer.analyse).not.toHaveBeenCalled();
    });

    it("rate limits attempts before spending CPU", async () => {
        const { service, prisma, analyzer } = setup(success());
        prisma.auditLog.count.mockResolvedValue(8);
        await expect(service.submit(user, { front, selfie })).rejects.toMatchObject({
            status: 429,
        });
        expect(analyzer.analyse).not.toHaveBeenCalled();
    });

    it("requires both photos and configured keys", async () => {
        const { service } = setup(success());
        await expect(service.submit(user, { front })).rejects.toMatchObject({ status: 400 });
        const saved = process.env.KYC_KEYS;
        delete process.env.KYC_KEYS;
        try {
            const unconfigured = setup(success());
            await expect(
                unconfigured.service.submit(user, { front, selfie }),
            ).rejects.toMatchObject({ status: 503 });
        } finally {
            process.env.KYC_KEYS = saved;
        }
    });
});

describe("KycService review", () => {
    let ctx: ReturnType<typeof setup>;
    const submissionId = "33333333-3333-4333-8333-333333333333";
    beforeEach(() => {
        ctx = setup(success());
    });
    function pendingRow() {
        return {
            id: submissionId,
            userId: user.id,
            createdAt: new Date(),
            flags: [],
            faceScore: 0.7,
            studentIdHmac: ctx.crypto.studentIdIndex(STUDENT_ID),
            sealedPayload: new Uint8Array(
                ctx.crypto.seal(
                    Buffer.from(JSON.stringify({ studentId: STUDENT_ID })),
                    `kyc|payload|${submissionId}|${user.id}`,
                ),
            ),
            user: { id: user.id, displayName: user.displayName, email: "a@b.c" },
        };
    }

    it("decrypts details and images for admins and audits each view", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue(pendingRow());
        const detail = await ctx.service.detail(submissionId, admin.id);
        expect(detail.extracted).toMatchObject({ studentId: STUDENT_ID });
        ctx.prisma.kycAsset.findUnique.mockResolvedValue({
            sealed: new Uint8Array(
                ctx.crypto.seal(Buffer.from("img"), `kyc|asset|${submissionId}|selfie|${user.id}`),
            ),
        });
        await expect(ctx.service.asset(submissionId, "selfie", admin.id)).resolves.toEqual(
            Buffer.from("img"),
        );
        await expect(ctx.service.asset(submissionId, "../etc", admin.id)).rejects.toMatchObject({
            status: 404,
        });
        const actions = ctx.prisma.auditLog.create.mock.calls.map((c: any) => c[0].data.action);
        expect(actions).toEqual(["kyc.viewed", "kyc.asset_viewed"]);
    });

    it("approval erases images and data and marks the user verified", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue(pendingRow());
        await expect(
            ctx.service.decide(submissionId, admin.id, { decision: "approve" }),
        ).resolves.toEqual({ status: "verified" });
        const update = ctx.prisma.kycSubmission.updateMany.mock.calls[0][0] as any;
        expect(update.where).toEqual({ id: submissionId, status: "needs_review" });
        expect(update.data.status).toBe("verified");
        expect(update.data.sealedPayload).toHaveLength(0);
        expect(ctx.prisma.kycAsset.deleteMany).toHaveBeenCalledWith({
            where: { submissionId },
        });
        expect(ctx.prisma.user.update).toHaveBeenCalledWith({
            where: { id: user.id },
            data: { kycStatus: 2 },
        });
    });

    it("rejection records the reason and also erases the data", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue(pendingRow());
        await ctx.service.decide(submissionId, admin.id, {
            decision: "reject",
            reason: "Ảnh không khớp",
        });
        const update = ctx.prisma.kycSubmission.updateMany.mock.calls[0][0] as any;
        expect(update.data).toMatchObject({ status: "rejected", reason: "Ảnh không khớp" });
        expect(ctx.prisma.user.update).toHaveBeenCalledWith({
            where: { id: user.id },
            data: { kycStatus: 3 },
        });
    });

    it("re-indexes an admin correction and blocks one that collides", async () => {
        ctx.prisma.kycSubmission.findFirst
            .mockResolvedValueOnce(pendingRow())
            .mockResolvedValueOnce(null);
        await ctx.service.decide(submissionId, admin.id, {
            decision: "approve",
            studentId: "9999999999",
        });
        expect(
            (ctx.prisma.kycSubmission.updateMany.mock.calls[0][0] as any).data.studentIdHmac,
        ).toBe(ctx.crypto.studentIdIndex("9999999999"));

        ctx.prisma.kycSubmission.findFirst
            .mockResolvedValueOnce(pendingRow())
            .mockResolvedValueOnce({ id: "other" });
        await expect(
            ctx.service.decide(submissionId, admin.id, {
                decision: "approve",
                studentId: "8888888888",
            }),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("forbids self-review and double decisions", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue(pendingRow());
        await expect(
            ctx.service.decide(submissionId, user.id, { decision: "approve" }),
        ).rejects.toMatchObject({ status: 403 });
        ctx.prisma.kycSubmission.updateMany.mockResolvedValue({ count: 0 });
        await expect(
            ctx.service.decide(submissionId, admin.id, { decision: "approve" }),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("hides decided or unknown submissions", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue(null);
        await expect(ctx.service.detail(submissionId, admin.id)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("withdrawal erases data and frees the user", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue({ id: submissionId });
        await ctx.service.withdraw(user.id);
        expect(ctx.prisma.kycAsset.deleteMany).toHaveBeenCalled();
        expect(
            (ctx.prisma.kycSubmission.update.mock.calls[0][0] as any).data,
        ).toMatchObject({ status: "withdrawn" });
        expect(ctx.prisma.user.update).toHaveBeenCalledWith({
            where: { id: user.id },
            data: { kycStatus: 0 },
        });
    });

    it("expires stale reviews", async () => {
        ctx.prisma.kycSubmission.findMany.mockResolvedValue([
            { id: submissionId, userId: user.id },
        ]);
        await expect(ctx.service.purgeStale(new Date())).resolves.toBe(1);
        expect((ctx.prisma.kycSubmission.updateMany.mock.calls[0][0] as any).data.status).toBe(
            "expired",
        );
        expect(ctx.prisma.kycAsset.deleteMany).toHaveBeenCalled();
    });

    it("status never leaks reviewer reasons for non-rejections", async () => {
        ctx.prisma.kycSubmission.findFirst.mockResolvedValue({
            status: "needs_review",
            createdAt: new Date(),
            reviewedAt: null,
            reason: "internal",
        });
        expect((await ctx.service.status(user.id)).reason).toBeNull();
    });
});
