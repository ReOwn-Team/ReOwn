import { createHmac } from "node:crypto";
import type { Request } from "express";
import { authRateLimitKey } from "../../../src/middlewares/auth-rate-limit.middleware";

describe("BFF auth rate-limit identity", () => {
    const secret = "isolated-bff-test-secret-at-least-32-characters";
    const previous = process.env.BFF_SHARED_SECRET;
    beforeEach(() => {
        process.env.BFF_SHARED_SECRET = secret;
    });
    afterAll(() => {
        if (previous === undefined) delete process.env.BFF_SHARED_SECRET;
        else process.env.BFF_SHARED_SECRET = previous;
    });
    function request(client: string, age = 0, signingKey = secret): Request {
        const time = String(Math.floor(Date.now() / 1000) - age);
        const headers: Record<string, string> = {
            "X-ReOwn-BFF-Client": client,
            "X-ReOwn-BFF-Time": time,
            "X-ReOwn-BFF-Signature": createHmac("sha256", signingKey)
                .update(`${client}:${time}`)
                .digest("hex"),
        };
        return {
            ip: "127.0.0.1",
            get: (name: string) => headers[name],
        } as Request;
    }
    it("separates signed client buckets behind the same BFF", () => {
        expect(authRateLimitKey(request("a".repeat(64)))).toBe(
            `bff:${"a".repeat(64)}`,
        );
        expect(authRateLimitKey(request("b".repeat(64)))).not.toBe(
            authRateLimitKey(request("a".repeat(64))),
        );
    });
    it.each([
        ["a".repeat(64), 0, "wrong-secret"],
        ["a".repeat(64), 120, secret],
        ["a".repeat(64), -120, secret],
        ["malformed-client", 0, secret],
    ])("rejects forged, expired or malformed identity", (client, age, key) => {
        expect(authRateLimitKey(request(client, age, key))).toBe("127.0.0.1");
    });
    it("ignores forwarded identities when not configured", () => {
        delete process.env.BFF_SHARED_SECRET;
        expect(authRateLimitKey(request("a".repeat(64)))).toBe("127.0.0.1");
    });
});
