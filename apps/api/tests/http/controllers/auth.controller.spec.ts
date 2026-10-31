import { UnauthorizedException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import type { AddressInfo } from "node:net";
import { configureHttp } from "../../../src/config/http.config";
import { CookieCsrfGuard } from "../../../src/guards/cookie-csrf.guard";
import {
    UserRoles,
    type AuthSessionResult,
} from "../../../src/models/user.model";
import { AuthCookieProvider } from "../../../src/providers/auth-cookie.provider";
import { UsersService } from "../../../src/services/users.service";
import { AuthController } from "../../../src/controllers/auth.controller";

const cookieName = "__Secure-reown_refresh";
const result: AuthSessionResult = {
    auth: {
        user: {
            id: "62b396d8-6381-4890-aee0-59a486f325c0",
            displayName: "Test User",
            avatarKey: null,
            email: "test@example.com",
            phone: "+84901234567",
            phoneVerified: 0,
            emailVerified: 0,
            kycStatus: 0,
            role: UserRoles.USER,
            status: "active",
        },
        accessToken: "new-access-token",
        tokenType: "Bearer",
        expiresIn: 900,
    },
    refreshToken: "new-refresh-token",
    refreshExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
};

describe("AuthController (versioned HTTP, real cookies and CSRF)", () => {
    const envKeys = [
        "NODE_ENV",
        "CLIENT_ORIGIN",
        "COOKIE_SECURE",
        "COOKIE_SAMESITE",
    ] as const;
    const previousEnv = Object.fromEntries(
        envKeys.map((key) => [key, process.env[key]]),
    );
    let app: INestApplication;
    let baseUrl: string;
    const users = {
        refresh: jest.fn<UsersService["refresh"]>(),
        logout: jest.fn<UsersService["logout"]>(),
    };

    beforeAll(async () => {
        Object.assign(process.env, {
            NODE_ENV: "test",
            CLIENT_ORIGIN: "http://localhost:5173",
            COOKIE_SECURE: "true",
            COOKIE_SAMESITE: "lax",
        });
        const module = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                AuthCookieProvider,
                CookieCsrfGuard,
                { provide: UsersService, useValue: users },
            ],
        }).compile();
        app = module.createNestApplication({ logger: false });
        configureHttp(app);
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/api/v1/auth`;
    });

    beforeEach(() => {
        jest.resetAllMocks();
        users.refresh.mockResolvedValue(result);
        users.logout.mockResolvedValue(undefined);
    });

    afterAll(async () => {
        await app?.close();
        for (const key of envKeys) {
            if (previousEnv[key] === undefined) delete process.env[key];
            else process.env[key] = previousEnv[key];
        }
    });

    async function request(
        path: string,
        options: {
            cookie?: string;
            headers?: Record<string, string | undefined>;
            body?: unknown;
        } = {},
    ) {
        const headers: Record<string, string | undefined> = {
            Origin: "http://localhost:5173",
            "X-ReOwn-Client": "web",
            ...(options.cookie === undefined ? {} : { Cookie: options.cookie }),
            ...(options.body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            ...options.headers,
        };
        return fetch(`${baseUrl}/${path}`, {
            method: "POST",
            headers: Object.fromEntries(
                Object.entries(headers).filter(
                    (entry): entry is [string, string] =>
                        entry[1] !== undefined,
                ),
            ),
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
            signal: AbortSignal.timeout(5000),
        });
    }

    function expectCleared(response: Response) {
        const cookie = response.headers.get("set-cookie");
        expect(cookie).toContain(`${cookieName}=;`);
        expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
        expect(cookie).toContain("Path=/api/v1/auth");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie).not.toContain("Domain=");
    }

    it("refreshes using only the parsed cookie and sends only auth JSON plus the rotated cookie", async () => {
        const response = await request("refresh", {
            cookie: `unrelated=ignored; ${cookieName}=old-refresh-token`,
            headers: { Authorization: "Bearer ignored-access-token" },
            body: { refreshToken: "ignored-body-token" },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual(result.auth);
        expect(users.refresh).toHaveBeenCalledTimes(1);
        expect(users.refresh).toHaveBeenCalledWith("old-refresh-token");
        const cookie = response.headers.get("set-cookie");
        expect(cookie).toContain(`${cookieName}=${result.refreshToken}`);
        expect(cookie).toContain(
            `Expires=${result.refreshExpiresAt.toUTCString()}`,
        );
        expect(cookie).toContain("Path=/api/v1/auth");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Lax");
        expect(cookie).not.toContain("Domain=");
    });

    it.each([undefined, "unrelated=ignored", `${cookieName}=`])(
        "clears the cookie on missing-cookie refresh: %s",
        async (cookie) => {
            const response = await request("refresh", {
                cookie,
                body: { refreshToken: "not-a-cookie" },
                headers: { Authorization: "Bearer not-a-cookie" },
            });
            expect(response.status).toBe(401);
            expectCleared(response);
            expect(users.refresh).not.toHaveBeenCalled();
        },
    );

    it("clears the cookie when the service rejects an expired or replayed refresh token", async () => {
        users.refresh.mockRejectedValue(new UnauthorizedException());
        const response = await request("refresh", {
            cookie: `${cookieName}=replayed-token`,
        });
        expect(response.status).toBe(401);
        expectCleared(response);
        expect(users.refresh).toHaveBeenCalledWith("replayed-token");
    });

    it("does not clear the cookie on an unexpected refresh failure", async () => {
        users.refresh.mockRejectedValue(
            new Error("Session database unavailable"),
        );
        const response = await request("refresh", {
            cookie: `${cookieName}=valid-token`,
        });
        expect(response.status).toBe(500);
        expect(response.headers.get("set-cookie")).toBeNull();
    });

    it.each([
        ["missing origin", { Origin: undefined }],
        ["wrong origin", { Origin: "http://evil.example" }],
        ["null origin", { Origin: "null" }],
        ["origin with path", { Origin: "http://localhost:5173/" }],
        ["missing client header", { "X-ReOwn-Client": undefined }],
        ["wrong client header", { "X-ReOwn-Client": "mobile" }],
    ] as const)(
        "rejects %s without clearing cookies or invoking services",
        async (_label, headers) => {
            for (const path of ["refresh", "logout"]) {
                const response = await request(path, {
                    cookie: `${cookieName}=live-token`,
                    headers,
                });
                expect(response.status).toBe(403);
                expect(response.headers.get("set-cookie")).toBeNull();
            }
            expect(users.refresh).not.toHaveBeenCalled();
            expect(users.logout).not.toHaveBeenCalled();
        },
    );

    it("logs out using the cookie even when the access token is expired, then clears it with 204", async () => {
        const response = await request("logout", {
            cookie: `${cookieName}=old-refresh-token`,
            headers: { Authorization: "Bearer expired-token" },
        });
        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(users.logout).toHaveBeenCalledTimes(1);
        expect(users.logout).toHaveBeenCalledWith("old-refresh-token");
        expectCleared(response);
    });

    it.each([undefined, "unrelated=ignored", `${cookieName}=`])(
        "logs out idempotently without a refresh cookie: %s",
        async (cookie) => {
            const response = await request("logout", {
                cookie,
                body: { refreshToken: "ignored-body-token" },
            });
            expect(response.status).toBe(204);
            expect(await response.text()).toBe("");
            expect(users.logout).not.toHaveBeenCalled();
            expectCleared(response);
        },
    );

    it("returns 204 and clears an unknown refresh cookie after service revocation", async () => {
        const response = await request("logout", {
            cookie: `${cookieName}=unknown-token`,
        });
        expect(response.status).toBe(204);
        expect(users.logout).toHaveBeenCalledWith("unknown-token");
        expectCleared(response);
    });

    it("preserves the cookie if logout fails unexpectedly", async () => {
        users.logout.mockRejectedValue(
            new Error("Session database unavailable"),
        );
        const response = await request("logout", {
            cookie: `${cookieName}=live-token`,
        });
        expect(response.status).toBe(500);
        expect(response.headers.get("set-cookie")).toBeNull();
    });
});
