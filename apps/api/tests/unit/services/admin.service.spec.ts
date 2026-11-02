import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import {
    AdminController,
    adminLimitSchema,
} from "../../../src/controllers/admin.controller";
import { AccessTokenGuard } from "../../../src/guards/access-token.guard";
import { AdminGuard } from "../../../src/inspection/admin.guard";
import {
    AdminService,
    adminUserSelect,
} from "../../../src/services/admin.service";
import { PrismaService } from "../../../src/prisma/prisma.service";

function setup() {
    const prisma = {
        user: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
        product: { count: jest.fn() },
        order: { count: jest.fn() },
        report: { count: jest.fn() },
        auditLog: { create: jest.fn(), createMany: jest.fn() },
    };
    return {
        prisma,
        service: new AdminService(prisma as unknown as PrismaService),
    };
}

describe("admin API", () => {
    it("requires access authentication before admin authorization", () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual([
            AccessTokenGuard,
            AdminGuard,
        ]);
        const guard = new AdminGuard();
        const context = (user: unknown) =>
            ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
        expect(() => guard.canActivate(context(undefined))).toThrow(
            ForbiddenException,
        );
        expect(() => guard.canActivate(context({ role: "user" }))).toThrow(
            ForbiddenException,
        );
        expect(guard.canActivate(context({ role: "admin" }))).toBe(true);
    });

    it("defaults and strictly bounds page sizes", () => {
        expect(adminLimitSchema.parse(undefined)).toBe(25);
        expect(adminLimitSchema.parse("100")).toBe(100);
        for (const value of [
            "0",
            "101",
            "-1",
            "1.5",
            "01",
            "1e2",
            "",
            "9999999999999999999999",
        ]) {
            expect(adminLimitSchema.safeParse(value).success).toBe(false);
        }
    });

    it("counts defined, non-deleted inventory and all orders and reports", async () => {
        const { prisma, service } = setup();
        prisma.user.count.mockResolvedValueOnce(8).mockResolvedValueOnce(7);
        prisma.product.count.mockResolvedValueOnce(6).mockResolvedValueOnce(5);
        prisma.order.count.mockResolvedValue(4);
        prisma.report.count.mockResolvedValue(3);
        await expect(service.statistics()).resolves.toEqual({
            users: 8,
            activeUsers: 7,
            products: 6,
            publishedProducts: 5,
            orders: 4,
            reports: 3,
        });
        expect(prisma.product.count).toHaveBeenNthCalledWith(1, {
            where: { deletedAt: null },
        });
        expect(prisma.product.count).toHaveBeenNthCalledWith(2, {
            where: {
                deletedAt: null,
                status: "published",
                reviewStatus: { in: ["approved", "not_required"] },
            },
        });
    });

    it("searches and paginates by stable ID and audits every returned user", async () => {
        const { prisma, service } = setup();
        const rows = [
            { id: "a", role: "user", status: "active" },
            { id: "b", role: "admin", status: "active" },
            { id: "c", role: "user", status: "active" },
        ];
        prisma.user.findMany
            .mockResolvedValueOnce(rows)
            .mockResolvedValueOnce([]);
        expect(adminUserSelect).not.toHaveProperty("passwordHash");
        await expect(service.users("admin", 2)).resolves.toEqual({
            items: rows.slice(0, 2),
            nextCursor: "b",
        });
        await expect(service.users("admin", 2, "b", "a%_")).resolves.toEqual({
            items: [],
            nextCursor: null,
        });
        expect(prisma.user.findMany).toHaveBeenLastCalledWith({
            where: {
                id: { gt: "b" },
                OR: [
                    {
                        displayName: {
                            contains: "a\\%\\_",
                            mode: "insensitive",
                        },
                    },
                    { email: { contains: "a\\%\\_", mode: "insensitive" } },
                    { phone: { contains: "a\\%\\_", mode: "insensitive" } },
                ],
            },
            orderBy: { id: "asc" },
            take: 3,
            select: adminUserSelect,
        });
        expect(prisma.auditLog.createMany).toHaveBeenCalledTimes(2);
        expect(
            prisma.auditLog.createMany.mock.calls[0][0].data.map(
                (row: any) => row.entityId,
            ),
        ).toEqual(["admin", "a", "b", "c"]);
        expect(
            JSON.stringify(prisma.auditLog.createMany.mock.calls),
        ).not.toContain("a%_");
    });

    it("returns only the selected user or 404", async () => {
        const { prisma, service } = setup();
        const row = {
            id: "a",
            role: "user",
            status: "active",
            kycSubmissions: Array.from({ length: 51 }, (_, i) => ({
                id: String(i),
            })),
        };
        prisma.user.findUnique
            .mockResolvedValueOnce(row)
            .mockResolvedValueOnce(null);
        await expect(service.user("admin", "a")).resolves.toEqual({
            id: "a",
            role: "user",
            status: "active",
            kycHistory: row.kycSubmissions.slice(0, 50),
            kycHistoryTruncated: true,
        });
        const select = prisma.user.findUnique.mock.calls[0][0].select;
        expect(select.kycSubmissions.select).toEqual({
            id: true,
            status: true,
            createdAt: true,
            reviewedAt: true,
            purgedAt: true,
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                actorId: "admin",
                actorType: "admin",
                action: "admin.user.detail_view",
                entityType: "user",
                entityId: "a",
            },
        });
        await expect(service.user("admin", "missing")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("fails closed when auditing personal data fails", async () => {
        const { prisma, service } = setup();
        prisma.user.findMany.mockResolvedValue([]);
        prisma.auditLog.createMany.mockRejectedValue(
            new Error("audit unavailable"),
        );
        await expect(service.users("admin", 25)).rejects.toThrow(
            "audit unavailable",
        );
        prisma.user.findUnique.mockResolvedValue({
            id: "a",
            kycSubmissions: [],
        });
        prisma.auditLog.create.mockRejectedValue(
            new Error("audit unavailable"),
        );
        await expect(service.user("admin", "a")).rejects.toThrow(
            "audit unavailable",
        );
    });
});
