import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import * as webPush from "web-push";
import { PrismaService } from "../prisma/prisma.service";
import { isAllowedEndpoint, type PushSubscriptionInput } from "./push.schemas";

const hashEndpoint = (endpoint: string) =>
    createHash("sha256").update(endpoint).digest("hex");
const LIMIT = 10;

@Injectable()
export class PushService {
    constructor(private readonly prisma: PrismaService) {}

    async subscribe(userId: string, input: PushSubscriptionInput) {
        const endpointHash = hashEndpoint(input.endpoint);
        await this.prisma
            .$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
                const existing = await tx.pushSubscription.findUnique({
                    where: { endpointHash },
                });
                if (existing && existing.userId !== userId)
                    throw new ConflictException("Subscription unavailable");
                if (existing) {
                    await tx.pushSubscription.update({
                        where: { id: existing.id },
                        data: {
                            p256dh: input.keys.p256dh,
                            auth: input.keys.auth,
                        },
                    });
                    return;
                }
                if (
                    (await tx.pushSubscription.count({ where: { userId } })) >=
                    LIMIT
                )
                    throw new ConflictException("Subscription limit reached");
                await tx.pushSubscription.create({
                    data: {
                        userId,
                        endpointHash,
                        endpoint: input.endpoint,
                        p256dh: input.keys.p256dh,
                        auth: input.keys.auth,
                    },
                });
            })
            .catch((error: unknown) => {
                if (
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    error.code === "P2002"
                )
                    throw new ConflictException("Subscription unavailable");
                if (error instanceof ConflictException) throw error;
                throw new InternalServerErrorException(
                    "Unable to save subscription",
                );
            });
    }

    async unsubscribe(userId: string, endpoint: string) {
        try {
            await this.prisma.pushSubscription.deleteMany({
                where: { userId, endpointHash: hashEndpoint(endpoint) },
            });
        } catch {
            throw new InternalServerErrorException(
                "Unable to remove subscription",
            );
        }
    }

    async notifyReview(userId: string): Promise<void> {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT;
        if (!publicKey || !privateKey || !subject) return;
        try {
            const subscriptions = await this.prisma.pushSubscription.findMany({
                where: { userId },
            });
            await Promise.all(
                subscriptions.map(async (subscription) => {
                    if (!isAllowedEndpoint(subscription.endpoint)) return;
                    try {
                        await webPush.sendNotification(
                            {
                                endpoint: subscription.endpoint,
                                keys: {
                                    p256dh: subscription.p256dh,
                                    auth: subscription.auth,
                                },
                            },
                            JSON.stringify({ url: "/listings" }),
                            {
                                vapidDetails: {
                                    subject,
                                    publicKey,
                                    privateKey,
                                },
                                TTL: 3600,
                                timeout: 10000,
                            },
                        );
                    } catch (error: unknown) {
                        if (
                            typeof error === "object" &&
                            error !== null &&
                            "statusCode" in error &&
                            (error.statusCode === 404 ||
                                error.statusCode === 410)
                        ) {
                            await this.prisma.pushSubscription
                                .deleteMany({
                                    where: {
                                        id: subscription.id,
                                        userId,
                                        endpointHash: subscription.endpointHash,
                                        p256dh: subscription.p256dh,
                                        auth: subscription.auth,
                                    },
                                })
                                .catch(() => undefined);
                        }
                    }
                }),
            );
        } catch {
            /* Best-effort delivery must not affect review decisions. */
        }
    }
}
