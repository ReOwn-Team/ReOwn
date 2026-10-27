import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { decode, sign } from "jsonwebtoken";
import { configureHttp } from "../../../src/config/http.config";
import { UserRoles } from "../../../src/models/user.model";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { UsersModule } from "../../../src/modules/users.module";

const userId = "62b396d8-6381-4890-aee0-59a486f325c0";
const clientOrigin = "http://localhost:5173";
const cookieName = "__Secure-reown_refresh";
const secret = "users-module-test-secret-do-not-use-in-production";
const user = {
    id: userId,
    displayName: "Test User",
    avatarKey: null,
    email: "test@example.com",
    phone: "+84901234567",
    phoneVerified: 0,
    emailVerified: 0,
    kycStatus: 0,
    role: UserRoles.USER,
    status: "active",
};
const registration = {
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    password: "Correct-test-password-123",
};
type SessionRow = {
    id: string;
    familyId: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
};
type SessionWhere = Partial<
    Pick<
        SessionRow,
        "id" | "familyId" | "userId" | "refreshTokenHash" | "revokedAt"
    >
> & { expiresAt?: { gt: Date } };
type SessionQuery = { where: SessionWhere; data?: Partial<SessionRow> };
type AuthBody = {
    user: typeof user;
    accessToken: string;
    tokenType: string;
    expiresIn: number;
};

function hash(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function refreshCookie(response: Response) {
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain(`${cookieName}=`);
    return cookie!.split(";")[0];
}

function rawCookie(cookie: string) {
    return cookie.slice(cookie.indexOf("=") + 1);
}

function expectClearedCookie(response: Response) {
    expect(response.headers.get("set-cookie")).toContain(`${cookieName}=;`);
    expect(response.headers.get("set-cookie")).toContain(
        "Expires=Thu, 01 Jan 1970",
    );
}

describe("UsersModule (HTTP integration, in-memory Prisma)", () => {
    const envKeys = [
        "JWT_SECRET",
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
    let savedPasswordHash: string;
    let savedUser: typeof user | null;
    let rows: SessionRow[];
    const prisma = {
        user: {
            create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        },
        session: {
            create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            updateMany: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        },
        $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        $transaction:
            jest.fn<
                (
                    callback: (tx: unknown) => Promise<unknown>,
                    options?: unknown,
                ) => Promise<unknown>
            >(),
    };

    function matches(row: SessionRow, where: SessionWhere) {
        return Object.entries(where).every(([key, value]) =>
            key === "expiresAt"
                ? row.expiresAt > (value as { gt: Date }).gt
                : row[key as keyof SessionRow] === value,
        );
    }

    beforeEach(async () => {
        Object.assign(process.env, {
            JWT_SECRET: secret,
            NODE_ENV: "test",
            CLIENT_ORIGIN: clientOrigin,
            COOKIE_SECURE: "true",
            COOKIE_SAMESITE: "lax",
        });
        jest.resetAllMocks();
        savedPasswordHash = "";
        savedUser = null;
        rows = [];
        prisma.user.create.mockImplementation(async (...args) => {
            const query = args[0] as { data: { passwordHash: string } };
            savedPasswordHash = query.data.passwordHash;
            savedUser = { ...user };
            return { ...savedUser };
        });
        prisma.user.findUnique.mockImplementation(async (...args) => {
            const query = args[0] as {
                where: Record<string, string>;
                select: { passwordHash?: boolean };
            };
            if (
                !savedUser ||
                !Object.entries(query.where).every(
                    ([key, value]) =>
                        savedUser![key as keyof typeof user] === value,
                )
            )
                return null;
            return query.select.passwordHash
                ? { ...savedUser, passwordHash: savedPasswordHash }
                : { ...savedUser };
        });
        prisma.user.update.mockImplementation(async (...args) => {
            const query = args[0] as { data: { displayName: string } };
            savedUser = { ...savedUser!, displayName: query.data.displayName };
            return { ...savedUser };
        });
        prisma.session.create.mockImplementation(async (...args) => {
            const query = args[0] as {
                data: Omit<SessionRow, "revokedAt" | "lastUsedAt">;
            };
            const row = { ...query.data, revokedAt: null, lastUsedAt: null };
            rows.push(row);
            return { ...row };
        });
        prisma.session.findUnique.mockImplementation(async (...args) => {
            const { where } = args[0] as SessionQuery;
            const row = rows.find((candidate) => matches(candidate, where));
            return row ? { ...row, user: { status: savedUser?.status } } : null;
        });
        prisma.session.findFirst.mockImplementation(async (...args) => {
            const { where } = args[0] as SessionQuery;
            const row = rows.find((candidate) => matches(candidate, where));
            return row ? { ...row } : null;
        });
        prisma.session.update.mockImplementation(async (...args) => {
            const { where, data } = args[0] as SessionQuery;
            const row = rows.find((candidate) => matches(candidate, where));
            if (!row) throw new Error("Session does not exist");
            Object.assign(row, data);
            return { ...row };
        });
        prisma.session.updateMany.mockImplementation(async (...args) => {
            const { where, data } = args[0] as SessionQuery;
            const matching = rows.filter((row) => matches(row, where));
            matching.forEach((row) => Object.assign(row, data));
            return { count: matching.length };
        });
        prisma.$queryRaw.mockResolvedValue([]);
        prisma.$transaction.mockImplementation(async (callback) => {
            const snapshot = rows.map((row) => ({ ...row }));
            try {
                return await callback(prisma);
            } catch (error) {
                rows = snapshot;
                throw error;
            }
        });
        const module = await Test.createTestingModule({
            imports: [UsersModule],
        })
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .compile();
        app = module.createNestApplication({ logger: false });
        configureHttp(app);
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        await app?.close();
        for (const key of envKeys) {
            if (previousEnv[key] === undefined) delete process.env[key];
            else process.env[key] = previousEnv[key];
        }
    });

    async function request(
        path: string,
        method = "GET",
        body?: unknown,
        options: {
            token?: string;
            cookie?: string;
            headers?: Record<string, string | undefined>;
        } = {},
    ) {
        const headers: Record<string, string | undefined> = {
            Origin: clientOrigin,
            "X-ReOwn-Client": "web",
            ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            ...(options.token
                ? { Authorization: `Bearer ${options.token}` }
                : {}),
            ...(options.cookie ? { Cookie: options.cookie } : {}),
            ...options.headers,
        };
        return fetch(`${baseUrl}/api/v1${path}`, {
            method,
            headers: Object.fromEntries(
                Object.entries(headers).filter(
                    (entry): entry is [string, string] =>
                        entry[1] !== undefined,
                ),
            ),
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(5000),
        });
    }

    async function register() {
        const response = await request("/users/register", "POST", registration);
        expect(response.status).toBe(201);
        return {
            auth: (await response.json()) as AuthBody,
            cookie: refreshCookie(response),
            response,
        };
    }

    async function login(identifier = user.email) {
        const response = await request("/users/login", "POST", {
            identifier,
            password: registration.password,
        });
        expect(response.status).toBe(200);
        return {
            auth: (await response.json()) as AuthBody,
            cookie: refreshCookie(response),
        };
    }

    it("registers, logs in, authenticates and updates with real hashing, JWT, cookies, sessions and guards", async () => {
        const registered = await register();
        expect(registered.response.headers.get("cache-control")).toBe(
            "no-store",
        );
        expect(registered.auth).toEqual({
            user,
            accessToken: expect.any(String),
            tokenType: "Bearer",
            expiresIn: 900,
        });
        expect(savedPasswordHash).toMatch(/^scrypt\$/);
        expect(savedPasswordHash).not.toContain(registration.password);
        const loggedIn = await login(user.phone);
        expect(rows).toHaveLength(2);
        expect(rows[0].familyId).not.toBe(rows[1].familyId);
        const me = await request("/users/me", "GET", undefined, {
            token: loggedIn.auth.accessToken,
        });
        expect(me.status).toBe(200);
        expect(await me.json()).toEqual(user);
        const updated = await request(
            "/users/me",
            "PATCH",
            { displayName: "New Name" },
            { token: registered.auth.accessToken },
        );
        expect(updated.status).toBe(200);
        expect(await updated.json()).toEqual({
            ...user,
            displayName: "New Name",
        });
        expect(prisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: userId, status: "active" },
                data: { displayName: "New Name" },
            }),
        );
    });

    it("stores only refresh hashes, rotates without extending expiry, and revokes only the replayed family", async () => {
        await register();
        const first = await login();
        const independent = await login();
        const old = rows.find(
            (row) => row.refreshTokenHash === hash(rawCookie(first.cookie)),
        )!;
        expect(old).toBeDefined();
        const refreshed = await request("/auth/refresh", "POST", undefined, {
            cookie: first.cookie,
        });
        expect(refreshed.status).toBe(200);
        expect(refreshed.headers.get("cache-control")).toBe("no-store");
        const auth = (await refreshed.json()) as AuthBody;
        expect(auth).toEqual({
            user,
            accessToken: expect.any(String),
            tokenType: "Bearer",
            expiresIn: 900,
        });
        const newCookie = refreshCookie(refreshed);
        expect(newCookie).not.toBe(first.cookie);
        const rotated = rows.find(
            (row) => row.refreshTokenHash === hash(rawCookie(newCookie)),
        )!;
        expect(rotated.familyId).toBe(old.familyId);
        expect(rotated.expiresAt).toEqual(old.expiresAt);
        expect(old.revokedAt).toBeInstanceOf(Date);
        expect(rotated.revokedAt).toBeNull();
        expect(decode(auth.accessToken)).toMatchObject({
            sub: userId,
            sid: old.familyId,
        });
        for (const cookie of [first.cookie, newCookie, independent.cookie]) {
            expect(JSON.stringify(rows)).not.toContain(rawCookie(cookie));
        }
        for (const token of [first.auth.accessToken, auth.accessToken]) {
            expect(
                (await request("/users/me", "GET", undefined, { token }))
                    .status,
            ).toBe(200);
        }
        const replay = await request("/auth/refresh", "POST", undefined, {
            cookie: first.cookie,
        });
        expect(replay.status).toBe(401);
        expectClearedCookie(replay);
        expect(
            rows
                .filter((row) => row.familyId === old.familyId)
                .every((row) => row.revokedAt instanceof Date),
        ).toBe(true);
        for (const token of [first.auth.accessToken, auth.accessToken]) {
            for (const method of ["GET", "PATCH"]) {
                expect(
                    (
                        await request(
                            "/users/me",
                            method,
                            method === "PATCH"
                                ? { displayName: "Blocked" }
                                : undefined,
                            { token },
                        )
                    ).status,
                ).toBe(401);
            }
        }
        expect(
            (
                await request("/auth/refresh", "POST", undefined, {
                    cookie: newCookie,
                })
            ).status,
        ).toBe(401);
        expect(
            (
                await request("/users/me", "GET", undefined, {
                    token: independent.auth.accessToken,
                })
            ).status,
        ).toBe(200);
        expect(
            (
                await request("/auth/refresh", "POST", undefined, {
                    cookie: independent.cookie,
                })
            ).status,
        ).toBe(200);
    });

    it.each(["current", "previous"])(
        "logout using the %s refresh token immediately invalidates the family",
        async (which) => {
            const first = await register();
            const refreshed = await request(
                "/auth/refresh",
                "POST",
                undefined,
                { cookie: first.cookie },
            );
            const auth = (await refreshed.json()) as AuthBody;
            const current = refreshCookie(refreshed);
            const response = await request("/auth/logout", "POST", undefined, {
                cookie: which === "previous" ? first.cookie : current,
            });
            expect(response.status).toBe(204);
            expect(await response.text()).toBe("");
            expect(response.headers.get("cache-control")).toBe("no-store");
            expectClearedCookie(response);
            for (const token of [first.auth.accessToken, auth.accessToken]) {
                expect(
                    (await request("/users/me", "GET", undefined, { token }))
                        .status,
                ).toBe(401);
            }
            expect(
                (
                    await request("/auth/refresh", "POST", undefined, {
                        cookie: current,
                    })
                ).status,
            ).toBe(401);
            expect(
                (
                    await request("/auth/logout", "POST", undefined, {
                        cookie: current,
                    })
                ).status,
            ).toBe(204);
        },
    );

    it.each([
        undefined,
        `${cookieName}=malformed`,
        `${cookieName}=${"x".repeat(43)}`,
    ])(
        "logout is idempotent with missing or unknown cookie: %s",
        async (cookie) => {
            const response = await request("/auth/logout", "POST", undefined, {
                cookie,
            });
            expect(response.status).toBe(204);
            expect(await response.text()).toBe("");
            expectClearedCookie(response);
            expect(rows).toHaveLength(0);
        },
    );

    it("rejects expired families for bearer access and refresh", async () => {
        const first = await register();
        rows[0].expiresAt = new Date(Date.now() - 1);
        expect(
            (
                await request("/users/me", "GET", undefined, {
                    token: first.auth.accessToken,
                })
            ).status,
        ).toBe(401);
        const refreshed = await request("/auth/refresh", "POST", undefined, {
            cookie: first.cookie,
        });
        expect(refreshed.status).toBe(401);
        expectClearedCookie(refreshed);
        expect(rows).toHaveLength(1);
        expect(rows[0].revokedAt).toBeInstanceOf(Date);
    });

    it("rejects inactive accounts and revokes their family on refresh", async () => {
        const first = await register();
        savedUser!.status = "locked";
        expect(
            (
                await request("/users/me", "GET", undefined, {
                    token: first.auth.accessToken,
                })
            ).status,
        ).toBe(401);
        expect(
            (
                await request("/auth/refresh", "POST", undefined, {
                    cookie: first.cookie,
                })
            ).status,
        ).toBe(401);
        expect(rows[0].revokedAt).toBeInstanceOf(Date);
    });

    it("rejects validly signed legacy stateless tokens and refresh-cookie-only /me requests", async () => {
        const first = await register();
        const token = sign({}, secret, {
            algorithm: "HS256",
            subject: userId,
            issuer: "reown-api",
            audience: "reown-web",
            expiresIn: 900,
        });
        expect(
            (await request("/users/me", "GET", undefined, { token })).status,
        ).toBe(401);
        expect(
            (
                await request("/users/me", "GET", undefined, {
                    cookie: first.cookie,
                })
            ).status,
        ).toBe(401);
    });

    it("uses generic login failures for unknown email, unknown phone and a wrong password", async () => {
        await register();
        for (const credentials of [
            {
                identifier: "unknown@example.com",
                password: registration.password,
            },
            { identifier: "+12345678901", password: registration.password },
            { identifier: user.email, password: "wrong-password" },
        ]) {
            const response = await request("/users/login", "POST", credentials);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({
                statusCode: 401,
                error: "Unauthorized",
                message: "Invalid credentials",
            });
            expect(response.headers.get("set-cookie")).toBeNull();
        }
        expect(rows).toHaveLength(1);
    });

    it("rejects CSRF on every cookie-writing route without changing the live session", async () => {
        const first = await register();
        for (const path of [
            "/users/register",
            "/users/login",
            "/auth/refresh",
            "/auth/logout",
        ]) {
            for (const headers of [
                { Origin: undefined },
                { Origin: "http://evil.example" },
                { "X-ReOwn-Client": undefined },
            ]) {
                const response = await request(path, "POST", registration, {
                    cookie: first.cookie,
                    headers,
                });
                expect(response.status).toBe(403);
                expect(response.headers.get("set-cookie")).toBeNull();
            }
        }
        expect(rows).toHaveLength(1);
        expect(rows[0].revokedAt).toBeNull();
        expect(
            (
                await request("/users/me", "GET", undefined, {
                    token: first.auth.accessToken,
                    headers: { Origin: undefined, "X-ReOwn-Client": undefined },
                })
            ).status,
        ).toBe(200);
    });

    it("allows credentialed CORS only for the exact configured origin", async () => {
        for (const origin of [
            clientOrigin,
            "http://evil.example",
            "http://localhost:5173.evil.example",
        ]) {
            const response = await request(
                "/auth/refresh",
                "OPTIONS",
                undefined,
                {
                    headers: {
                        Origin: origin,
                        "Access-Control-Request-Method": "POST",
                        "Access-Control-Request-Headers":
                            "X-ReOwn-Client,Content-Type",
                    },
                },
            );
            expect(response.status).toBe(204);
            expect(
                response.headers.get("access-control-allow-credentials"),
            ).toBe("true");
            expect(response.headers.get("access-control-allow-origin")).toBe(
                clientOrigin,
            );
            expect(
                response.headers.get("access-control-allow-origin") === origin,
            ).toBe(origin === clientOrigin);
            expect(
                response.headers.get("access-control-allow-headers"),
            ).toContain("X-ReOwn-Client");
        }
        expect(rows).toHaveLength(0);
    });

    it("exposes only version 1 endpoints", async () => {
        for (const path of [
            "/users/register",
            "/users/login",
            "/users/me",
            "/auth/refresh",
            "/auth/logout",
            "/api/v2/users/me",
        ]) {
            const response = await fetch(`${baseUrl}${path}`, {
                method: path.endsWith("/me") ? "GET" : "POST",
                signal: AbortSignal.timeout(5000),
            });
            expect(response.status).toBe(404);
        }
        expect(rows).toHaveLength(0);
    });

    it("shares the exact 10-request credential rate boundary across versioned registration and login", async () => {
        for (let i = 0; i < 10; i++) {
            expect(
                (
                    await request(
                        i % 2 ? "/users/login" : "/users/register",
                        "POST",
                        {},
                    )
                ).status,
            ).toBe(400);
        }
        for (const path of ["/users/register", "/users/login"]) {
            const blocked = await request(path, "POST", registration);
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(
                0,
            );
            expect(
                Number(blocked.headers.get("retry-after")),
            ).toBeLessThanOrEqual(900);
        }
        expect((await request("/users/me")).status).toBe(401);
        expect((await request("/auth/logout", "POST")).status).toBe(204);
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("shares the exact 60-request boundary across versioned refresh and logout, separately from credentials", async () => {
        for (let i = 0; i < 60; i++) {
            expect(
                (
                    await request(
                        i % 2 ? "/auth/logout" : "/auth/refresh",
                        "POST",
                    )
                ).status,
            ).toBe(i % 2 ? 204 : 401);
        }
        for (const path of ["/auth/refresh", "/auth/logout"]) {
            const blocked = await request(path, "POST");
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(
                0,
            );
            expect(
                Number(blocked.headers.get("retry-after")),
            ).toBeLessThanOrEqual(900);
        }
        expect((await request("/users/login", "POST", {})).status).toBe(400);
        expect((await request("/users/me")).status).toBe(401);
    });
});
