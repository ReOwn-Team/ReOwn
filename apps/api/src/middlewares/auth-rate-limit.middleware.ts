import { rateLimit } from "express-rate-limit";

export function createAuthRateLimit(limit = 10) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            statusCode: 429,
            message: "Too many authentication attempts; try again later",
        },
    });
}
