import { UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { decode, sign } from "jsonwebtoken";
import {
    AccessTokenProvider,
    ACCESS_TOKEN_TTL_SECONDS,
} from "../../../src/providers/access-token.provider";

const SECRET = "users-provider-test-secret-never-use-in-production";
const USER_ID = "62b396d8-6381-4890-aee0-59a486f325c0";
const FAMILY_ID = "5fa89e49-dad2-4bf7-87ac-7df984ff7a1c";

describe("AccessTokenProvider", () => {
    const previousSecret = process.env.JWT_SECRET;
    let tokens: AccessTokenProvider;

    beforeEach(() => {
        process.env.JWT_SECRET = SECRET;
        tokens = new AccessTokenProvider();
    });

    afterEach(() => {
        if (previousSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = previousSecret;
        }
    });

    it("requires a nonempty secret of at least 32 bytes", () => {
        for (const value of [undefined, "", "short", " ".repeat(64)]) {
            if (value === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = value;
            expect(() => new AccessTokenProvider()).toThrow("JWT_SECRET");
        }
    });

    it("issues a signed HS256 token containing only identity and registered claims", () => {
        const token = tokens.issue(USER_ID, FAMILY_ID);
        const decoded = decode(token, { complete: true });
        expect(decoded?.header.alg).toBe("HS256");
        expect(decoded?.payload).toMatchObject({
            sub: USER_ID,
            sid: FAMILY_ID,
            iss: "reown-api",
            aud: "reown-web",
        });
        const payload = decoded?.payload as { iat: number; exp: number };
        expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
        expect(Object.keys(decoded!.payload).sort()).toEqual([
            "aud",
            "exp",
            "iat",
            "iss",
            "sid",
            "sub",
        ]);
        expect(tokens.verify(token)).toEqual({
            userId: USER_ID,
            familyId: FAMILY_ID,
        });
    });

    function customToken(payload: Record<string, unknown>, secret = SECRET) {
        return sign(payload, secret, { algorithm: "HS256" });
    }

    const now = () => Math.floor(Date.now() / 1000);
    const claims = () => ({
        sub: USER_ID,
        sid: FAMILY_ID,
        iss: "reown-api",
        aud: "reown-web",
        iat: now(),
        exp: now() + 900,
    });

    it("rejects tampered signatures and tokens signed by another key", () => {
        const token = tokens.issue(USER_ID, FAMILY_ID);
        const [header, body, signature] = token.split(".");
        const altered = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
        expect(() => tokens.verify(`${header}.${body}.${altered}`)).toThrow(
            UnauthorizedException,
        );
        expect(() =>
            tokens.verify(
                customToken(claims(), "another-long-test-secret-do-not-use"),
            ),
        ).toThrow(UnauthorizedException);
    });

    it.each([
        ["expired", () => ({ ...claims(), iat: now() - 120, exp: now() - 1 })],
        [
            "too old",
            () => ({ ...claims(), iat: now() - 901, exp: now() + 900 }),
        ],
        ["wrong issuer", () => ({ ...claims(), iss: "another-api" })],
        ["wrong audience", () => ({ ...claims(), aud: "another-client" })],
        ["non-UUID subject", () => ({ ...claims(), sub: "admin" })],
        [
            "old stateless token without a session",
            () => {
                const { sid, ...rest } = claims();
                return rest;
            },
        ],
        ["non-UUID session", () => ({ ...claims(), sid: "session-family" })],
        ["null session", () => ({ ...claims(), sid: null })],
        ["numeric session", () => ({ ...claims(), sid: 42 })],
        ["array session", () => ({ ...claims(), sid: [FAMILY_ID] })],
        [
            "object session",
            () => ({ ...claims(), sid: { familyId: FAMILY_ID } }),
        ],
        ["fractional expiry", () => ({ ...claims(), exp: now() + 899.5 })],
        [
            "missing expiry",
            () => {
                const { exp, ...rest } = claims();
                return rest;
            },
        ],
        ["not yet valid", () => ({ ...claims(), nbf: now() + 60 })],
    ] as const)("rejects %s claims", (_label, payload) => {
        expect(() => tokens.verify(customToken(payload()))).toThrow(
            UnauthorizedException,
        );
    });

    it("rejects a token whose signed session claim was altered", () => {
        const token = tokens.issue(USER_ID, FAMILY_ID);
        const [header, body, signature] = token.split(".");
        const payload = JSON.parse(Buffer.from(body, "base64url").toString());
        payload.sid = "1aac357b-93f4-425b-8cb7-493f2851a2fd";
        const changedBody = Buffer.from(JSON.stringify(payload)).toString(
            "base64url",
        );
        expect(() =>
            tokens.verify(`${header}.${changedBody}.${signature}`),
        ).toThrow(UnauthorizedException);
    });

    it("rejects a token without an issued-at claim", () => {
        const { iat, ...payload } = claims();
        const token = sign(payload, SECRET, {
            algorithm: "HS256",
            noTimestamp: true,
        });
        expect(() => tokens.verify(token)).toThrow(UnauthorizedException);
    });

    it("rejects a different signing algorithm", () => {
        const token = sign(claims(), SECRET, { algorithm: "HS384" });
        expect(() => tokens.verify(token)).toThrow(UnauthorizedException);
    });

    it.each(["not-a-jwt", "", "e30.e30."])(
        "rejects malformed tokens: %s",
        (token) => {
            expect(() => tokens.verify(token)).toThrow(UnauthorizedException);
        },
    );
});
