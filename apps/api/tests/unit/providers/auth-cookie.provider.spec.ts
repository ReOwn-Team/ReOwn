import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import type { Request, Response } from "express";
import { AuthCookieProvider } from "../../../src/providers/auth-cookie.provider";

const envKeys = [
    "NODE_ENV",
    "CLIENT_ORIGIN",
    "COOKIE_SECURE",
    "COOKIE_SAMESITE",
] as const;

describe("AuthCookieProvider", () => {
    const previous = Object.fromEntries(
        envKeys.map((key) => [key, process.env[key]]),
    );

    beforeEach(() => {
        for (const key of envKeys) delete process.env[key];
    });
    afterEach(() => {
        for (const key of envKeys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });

    it("defaults to secure host-only HttpOnly Lax cookies with a narrow auth path", () => {
        const config = new AuthCookieProvider();
        const cookie = jest.fn();
        const response = { cookie } as unknown as Response;
        const expiry = new Date("2030-01-01T00:00:00Z");
        config.set(response, "a-test-token", expiry);
        expect(config.clientOrigin).toBe("http://localhost:5173");
        expect(cookie).toHaveBeenCalledWith(
            "__Secure-reown_refresh",
            "a-test-token",
            {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/api/v1/auth",
                expires: expiry,
            },
        );
    });

    it("clears with the same cookie name, path and security attributes", () => {
        const config = new AuthCookieProvider();
        const clearCookie = jest.fn();
        config.clear({ clearCookie } as unknown as Response);
        expect(clearCookie).toHaveBeenCalledWith("__Secure-reown_refresh", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/api/v1/auth",
        });
    });

    it.each([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://[::1]:5173",
    ])("allows explicit insecure localhost development at %s", (origin) => {
        process.env.CLIENT_ORIGIN = origin;
        process.env.COOKIE_SECURE = "false";
        const config = new AuthCookieProvider();
        expect(config.secure).toBe(false);
        expect(config.cookieName).toBe("reown_refresh");
    });

    it("does not allow insecure cookies for nonlocal development", () => {
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        process.env.COOKIE_SECURE = "false";
        expect(() => new AuthCookieProvider()).toThrow("localhost");
    });

    it("requires an explicit HTTPS client origin in production", () => {
        process.env.NODE_ENV = "production";
        expect(() => new AuthCookieProvider()).toThrow("CLIENT_ORIGIN");
        process.env.CLIENT_ORIGIN = "http://localhost:5173";
        expect(() => new AuthCookieProvider()).toThrow("HTTPS");
        process.env.CLIENT_ORIGIN = "https://app.example.com";
        expect(new AuthCookieProvider().secure).toBe(true);
        process.env.COOKIE_SECURE = "false";
        expect(() => new AuthCookieProvider()).toThrow("Secure");
    });

    it("allows cross-site cookies only when Secure", () => {
        process.env.COOKIE_SAMESITE = "none";
        expect(new AuthCookieProvider().sameSite).toBe("none");
        process.env.COOKIE_SECURE = "false";
        expect(() => new AuthCookieProvider()).toThrow("SameSite=None");
    });

    it.each(["lax", "strict", "none"])(
        "accepts explicit SameSite=%s",
        (value) => {
            process.env.COOKIE_SAMESITE = value;
            expect(new AuthCookieProvider().sameSite).toBe(value);
        },
    );

    it.each(["", "true", "Lax", "invalid"])(
        "rejects invalid SameSite setting %s",
        (value) => {
            process.env.COOKIE_SAMESITE = value;
            expect(() => new AuthCookieProvider()).toThrow("COOKIE_SAMESITE");
        },
    );

    it.each(["", "1", "False", "invalid"])(
        "rejects ambiguous Secure setting %s",
        (value) => {
            process.env.COOKIE_SECURE = value;
            expect(() => new AuthCookieProvider()).toThrow("COOKIE_SECURE");
        },
    );

    it.each([
        "null",
        "*",
        "https://app.example.com/",
        "https://app.example.com/path",
        "https://app.example.com?x=1",
        "https://app.example.com#fragment",
        "https://user:pass@app.example.com",
        "ftp://app.example.com",
        "https://one.example.com,https://two.example.com",
    ])("rejects noncanonical or unsafe client origins: %s", (origin) => {
        process.env.CLIENT_ORIGIN = origin;
        expect(() => new AuthCookieProvider()).toThrow("CLIENT_ORIGIN");
    });

    it("reads only a string-valued named cookie, never JSON or another cookie", () => {
        const config = new AuthCookieProvider();
        expect(
            config.read({
                cookies: { [config.cookieName]: "raw-token" },
            } as Request),
        ).toBe("raw-token");
        expect(
            config.read({
                cookies: { [config.cookieName]: { token: "raw-token" } },
            } as Request),
        ).toBeUndefined();
        expect(
            config.read({
                cookies: { other: "raw-token" },
            } as unknown as Request),
        ).toBeUndefined();
        expect(config.read({} as Request)).toBeUndefined();
    });
});
