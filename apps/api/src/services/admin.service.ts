import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Explicit allowlists: never fetch credentials, KYC payloads, assets or hashes.
export const adminUserSelect = {
    id: true,
    displayName: true,
    email: true,
    phone: true,
    emailVerified: true,
    phoneVerified: true,
    kycStatus: true,
    role: true,
    status: true,
} as const;

export const adminKycHistorySelect = {
    id: true,
    status: true,
    createdAt: true,
    reviewedAt: true,
    purgedAt: true,
} as const;

@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) {}

    async statistics() {
        const [
            users,
            activeUsers,
            products,
            publishedProducts,
            orders,
            reports,
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { status: "active" } }),
            this.prisma.product.count({ where: { deletedAt: null } }),
            this.prisma.product.count({
                where: {
                    deletedAt: null,
                    status: "published",
                    reviewStatus: { in: ["approved", "not_required"] },
                },
            }),
            this.prisma.order.count(),
            this.prisma.report.count(),
        ]);
        return {
            users,
            activeUsers,
            products,
            publishedProducts,
            orders,
            reports,
        };
    }

    async users(
        actorId: string,
        limit: number,
        cursor?: string,
        search?: string,
    ) {
        // Prisma's PostgreSQL contains uses LIKE; escape wildcard characters.
        const term = search?.replace(/[\\%_]/g, "\\$&");
        const rows = await this.prisma.user.findMany({
            where: {
                ...(cursor ? { id: { gt: cursor } } : {}),
                ...(term
                    ? {
                          OR: [
                              {
                                  displayName: {
                                      contains: term,
                                      mode: "insensitive" as const,
                                  },
                              },
                              {
                                  email: {
                                      contains: term,
                                      mode: "insensitive" as const,
                                  },
                              },
                              {
                                  phone: {
                                      contains: term,
                                      mode: "insensitive" as const,
                                  },
                              },
                          ],
                      }
                    : {}),
            },
            orderBy: { id: "asc" },
            take: limit + 1,
            select: adminUserSelect,
        });
        const hasMore = rows.length > limit;
        const items = rows.slice(0, limit);
        // Audit even an empty search, without retaining the search term or contact data.
        await this.prisma.auditLog.createMany({
            data: [
                {
                    actorId,
                    actorType: "admin",
                    action: "admin.users.list",
                    entityType: "user",
                    entityId: actorId,
                    metadata: { resultCount: items.length, searched: !!term },
                },
                ...rows.map((item) => ({
                    actorId,
                    actorType: "admin",
                    action: "admin.user.list_view",
                    entityType: "user",
                    entityId: item.id,
                })),
            ],
        });
        return {
            items,
            nextCursor: hasMore ? items[items.length - 1].id : null,
        };
    }

    async user(actorId: string, id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                ...adminUserSelect,
                kycSubmissions: {
                    select: adminKycHistorySelect,
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    take: 51,
                },
            },
        });
        if (!user) throw new NotFoundException("User not found");
        await this.prisma.auditLog.create({
            data: {
                actorId,
                actorType: "admin",
                action: "admin.user.detail_view",
                entityType: "user",
                entityId: id,
            },
        });
        const { kycSubmissions, ...profile } = user;
        return {
            ...profile,
            kycHistory: kycSubmissions.slice(0, 50),
            kycHistoryTruncated: kycSubmissions.length > 50,
        };
    }
}
