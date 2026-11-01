import { createHmac, timingSafeEqual } from "node:crypto";
import { ipKeyGenerator, rateLimit, type Store } from "express-rate-limit";
import type { Request } from "express";

// Only a trusted web server can partition the API's auth bucket by its client.
// Unsigned/expired headers always fall back to the existing IP-based limiter.
export function authRateLimitKey(request: Request): string {
    const secret = process.env.BFF_SHARED_SECRET;
    const client = request.get("X-ReOwn-BFF-Client") ?? "";
    const time = request.get("X-ReOwn-BFF-Time") ?? "";
    const signature = request.get("X-ReOwn-BFF-Signature") ?? "";
    if (
        secret &&
        secret.length >= 32 &&
        /^[a-f0-9]{64}$/.test(client) &&
        /^\d{10}$/.test(time) &&
        /^[a-f0-9]{64}$/.test(signature) &&
        Math.abs(Date.now() / 1000 - Number(time)) <= 60
    ) {
        const expected = createHmac("sha256", secret)
            .update(`${client}:${time}`)
            .digest();
        if (timingSafeEqual(expected, Buffer.from(signature, "hex")))
            return `bff:${client}`;
    }
    return ipKeyGenerator(request.ip ?? "127.0.0.1");
}
export function createAuthRateLimit(limit = 10, store?: Store) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        store,
        keyGenerator: authRateLimitKey,
        passOnStoreError: false,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            statusCode: 429,
            message: "Too many authentication attempts; try again later",
        },
    });
}
