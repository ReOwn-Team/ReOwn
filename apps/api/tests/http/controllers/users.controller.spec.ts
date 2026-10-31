import { UnauthorizedException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
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
import { Prisma } from "../../../src/generated/prisma/client";
import { AccessTokenGuard } from "../../../src/guards/access-token.guard";
import { UserRoles, type UserProfile } from "../../../src/models/user.model";
import { configureHttp } from "../../../src/config/http.config";
import { SessionsService } from "../../../src/services/sessions.service";
import { AuthCookieProvider } from "../../../src/providers/auth-cookie.provider";
import { CookieCsrfGuard } from "../../../src/guards/cookie-csrf.guard";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { AccessTokenProvider } from "../../../src/providers/access-token.provider";
import { PasswordProvider } from "../../../src/providers/password.provider";
import { UsersService } from "../../../src/services/users.service";
import { UsersController } from "../../../src/controllers/users.controller";

const userId = "f47221b7-a23b-44bb-9c42-cfc153728910";
const familyId = "a2400f82-d6b8-4b56-a144-83abb002d939";
const session = {
    userId,
    familyId,
    refreshToken: "internal-refresh-token",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
};
const otherUserId = "9d9c76d0-733e-4071-96c8-ad0237271910";
const safeSelect = {
    id: true,
    displayName: true,
    avatarKey: true,
    email: true,
    phone: true,
    emailVerified: true,
    phoneVerified: true,
    kycStatus: true,
    role: true,
    status: true,
};
const profile: UserProfile = {
    id: userId,
    displayName: "Alice",
    avatarKey: null,
    email: "alice@example.com",
    phone: "+84901234567",
    emailVerified: 0,
    phoneVerified: 0,
    kycStatus: 0,
    role: UserRoles.USER,
    status: "active",
};
const validRegister = {
    displayName: "Alice",
    email: "alice@example.com",
    phone: "+84901234567",
    password: "a secure password",
};
const validLogin = {
    email: validRegister.email,
    password: validRegister.password,
};
const passwordHash = "stored-password-hash";
const authResponse = {
    user: profile,
    accessToken: "issued-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
};
const privilegedFields = {
    id: otherUserId,
    userId: otherUserId,
    role: "admin",
    status: "locked",
    passwordHash: "attacker-supplied-hash",
    hash: "attacker-supplied-hash",
    emailVerified: 1,
    phoneVerified: 1,
    kycStatus: 1,
    avatarKey: "untrusted-avatar",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    unexpected: true,
};
const emailAtLimit = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;

function prismaError(code: string, target?: string) {
    return new Prisma.PrismaClientKnownRequestError(
        "Private database details",
        {
            code,
            clientVersion: "test",
            ...(target ? { meta: { target: [target] } } : {}),
        },
    );
}

describe("UsersController (HTTP)", () => {
    const envKeys = [
        "CLIENT_ORIGIN",
        "COOKIE_SECURE",
        "COOKIE_SAMESITE",
        "NODE_ENV",
    ] as const;
    const previousEnv = Object.fromEntries(
        envKeys.map((key) => [key, process.env[key]]),
    );
    let app: INestApplication;
    let baseUrl: string;
    const prisma = {
        user: {
            create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
            update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        },
    };
    const passwords = {
        hash: jest.fn<PasswordProvider["hash"]>(),
        verify: jest.fn<PasswordProvider["verify"]>(),
    };
    const tokens = {
        issue: jest.fn<AccessTokenProvider["issue"]>(),
        verify: jest.fn<AccessTokenProvider["verify"]>(),
    };

    const sessions = {
        create: jest.fn<SessionsService["create"]>(),
        assertActive: jest.fn<SessionsService["assertActive"]>(),
    };

    beforeAll(async () => {
        process.env.NODE_ENV = "test";
        process.env.CLIENT_ORIGIN = "http://localhost:5173";
        process.env.COOKIE_SECURE = "true";
        process.env.COOKIE_SAMESITE = "lax";
        const module = await Test.createTestingModule({
            controllers: [UsersController],
            providers: [
                UsersService,
                { provide: SessionsService, useValue: sessions },
                AuthCookieProvider,
                CookieCsrfGuard,
                AccessTokenGuard,
                PrismaService,
                PasswordProvider,
                AccessTokenProvider,
            ],
        })
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .overrideProvider(PasswordProvider)
            .useValue(passwords)
            .overrideProvider(AccessTokenProvider)
            .useValue(tokens)
            .compile();
        app = module.createNestApplication({ logger: false });
        configureHttp(app);
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/api/v1/users`;
    });

    afterAll(async () => {
        await app?.close();
        for (const key of envKeys) {
            if (previousEnv[key] === undefined) delete process.env[key];
            else process.env[key] = previousEnv[key];
        }
    });

    beforeEach(() => {
        jest.resetAllMocks();
        prisma.user.create.mockResolvedValue(profile);
        prisma.user.findUnique.mockResolvedValue(profile);
        prisma.user.update.mockResolvedValue(profile);
        passwords.hash.mockResolvedValue(passwordHash);
        passwords.verify.mockResolvedValue(true);
        tokens.issue.mockReturnValue(authResponse.accessToken);
        tokens.verify.mockReturnValue({ userId, familyId });
        sessions.create.mockResolvedValue(session);
        sessions.assertActive.mockResolvedValue(undefined);
    });

    async function request(
        path: string,
        method = "GET",
        body?: unknown,
        authorization?: string,
        headerOverrides: Record<string, string | undefined> = {},
    ) {
        const csrfHeaders: Record<string, string | undefined> = {
            Origin: "http://localhost:5173",
            "X-ReOwn-Client": "web",
            ...headerOverrides,
        };
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                ...Object.fromEntries(
                    Object.entries(csrfHeaders).filter(
                        (entry): entry is [string, string] =>
                            entry[1] !== undefined,
                    ),
                ),
                ...(body === undefined
                    ? {}
                    : { "content-type": "application/json" }),
                ...(authorization === undefined ? {} : { authorization }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(5000),
        });
        return {
            status: response.status,
            body: await response.json(),
            cacheControl: response.headers.get("cache-control"),
            setCookie: response.headers.get("set-cookie"),
        };
    }

    describe("credential CSRF protection", () => {
        it.each([
            ["missing origin", { Origin: undefined }],
            ["wrong origin", { Origin: "http://evil.example" }],
            [
                "lookalike origin",
                { Origin: "http://localhost:5173.evil.example" },
            ],
            ["missing client header", { "X-ReOwn-Client": undefined }],
            ["wrong client header", { "X-ReOwn-Client": "mobile" }],
        ] as const)(
            "rejects %s before processing either credential route",
            async (_label, headers) => {
                for (const path of ["/register", "/login"]) {
                    const response = await request(
                        path,
                        "POST",
                        path === "/register" ? validRegister : validLogin,
                        undefined,
                        headers,
                    );
                    expect(response.status).toBe(403);
                    expect(response.setCookie).toBeNull();
                }
                expect(prisma.user.create).not.toHaveBeenCalled();
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
                expect(passwords.hash).not.toHaveBeenCalled();
                expect(passwords.verify).not.toHaveBeenCalled();
                expect(sessions.create).not.toHaveBeenCalled();
            },
        );
    });

    describe("POST /users/register", () => {
        it("normalizes input, creates only safe account defaults and returns 201 without password data", async () => {
            const response = await request("/register", "POST", {
                ...validRegister,
                displayName: "  Alice  ",
                email: "  ALICE@EXAMPLE.COM  ",
                phone: "  +84901234567  ",
                password: "  a secure password  ",
            });

            expect(response).toMatchObject({
                status: 201,
                body: authResponse,
                cacheControl: "no-store",
            });
            expect(response.body).toEqual(authResponse);
            expect(response.body).not.toHaveProperty("refreshToken");
            expect(response.body).not.toHaveProperty("refreshExpiresAt");
            expect(response.setCookie).toContain(
                `__Secure-reown_refresh=${session.refreshToken}`,
            );
            expect(response.setCookie).toContain("HttpOnly");
            expect(response.setCookie).toContain("Path=/api/v1/auth");
            expect(sessions.create).toHaveBeenCalledWith(userId);
            expect(response.body).not.toHaveProperty("user.passwordHash");
            expect(response.body).not.toHaveProperty("user.password");
            expect(passwords.hash).toHaveBeenCalledTimes(1);
            expect(passwords.hash).toHaveBeenCalledWith(
                "  a secure password  ",
            );
            expect(prisma.user.create).toHaveBeenCalledTimes(1);
            expect(prisma.user.create).toHaveBeenCalledWith({
                data: {
                    displayName: "Alice",
                    email: "alice@example.com",
                    phone: "+84901234567",
                    passwordHash,
                    phoneVerified: 0,
                    emailVerified: 0,
                    kycStatus: 0,
                    role: UserRoles.USER,
                    status: "active",
                },
                select: safeSelect,
            });
            expect(tokens.issue).toHaveBeenCalledTimes(1);
            expect(tokens.issue).toHaveBeenCalledWith(userId, familyId);
            expect(tokens.verify).not.toHaveBeenCalled();
        });

        it.each([
            [
                "minimum lengths",
                {
                    displayName: "A",
                    phone: "+12345678",
                    password: "p".repeat(12),
                },
            ],
            [
                "maximum lengths",
                {
                    displayName: "A".repeat(100),
                    email: emailAtLimit,
                    phone: "+123456789012345",
                    password: "p".repeat(128),
                },
            ],
        ])("accepts %s", async (_label, fields) => {
            const { password, ...profileFields } = fields;

            expect(
                (
                    await request("/register", "POST", {
                        ...validRegister,
                        ...fields,
                    })
                ).status,
            ).toBe(201);
            expect(passwords.hash).toHaveBeenCalledWith(password);
            expect(prisma.user.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    ...profileFields,
                    passwordHash,
                }),
                select: safeSelect,
            });
        });

        it.each([
            ["missing fields", {}],
            [
                "missing displayName",
                {
                    email: validRegister.email,
                    phone: validRegister.phone,
                    password: validRegister.password,
                },
            ],
            [
                "missing email",
                {
                    displayName: "Alice",
                    phone: validRegister.phone,
                    password: validRegister.password,
                },
            ],
            [
                "missing phone",
                {
                    displayName: "Alice",
                    email: validRegister.email,
                    password: validRegister.password,
                },
            ],
            [
                "missing password",
                {
                    displayName: "Alice",
                    email: validRegister.email,
                    phone: validRegister.phone,
                },
            ],
            ["blank displayName", { ...validRegister, displayName: "   " }],
            [
                "long displayName",
                { ...validRegister, displayName: "a".repeat(101) },
            ],
            ["non-text displayName", { ...validRegister, displayName: 42 }],
            ["invalid email", { ...validRegister, email: "not-an-email" }],
            ["long email", { ...validRegister, email: `${emailAtLimit}d` }],
            ["null email", { ...validRegister, email: null }],
            ["phone without plus", { ...validRegister, phone: "84901234567" }],
            [
                "phone with leading zero",
                { ...validRegister, phone: "+012345678" },
            ],
            ["short phone", { ...validRegister, phone: "+1234567" }],
            ["long phone", { ...validRegister, phone: "+1234567890123456" }],
            [
                "phone with separators",
                { ...validRegister, phone: "+84 901234567" },
            ],
            ["non-text phone", { ...validRegister, phone: 84901234567 }],
            ["short password", { ...validRegister, password: "p".repeat(11) }],
            ["long password", { ...validRegister, password: "p".repeat(129) }],
            ["null password", { ...validRegister, password: null }],
            ["array body", []],
        ])("rejects %s before hashing or writing", async (_label, body) => {
            expect((await request("/register", "POST", body)).status).toBe(400);
            expect(passwords.hash).not.toHaveBeenCalled();
            expect(prisma.user.create).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
        });

        it.each(Object.entries(privilegedFields))(
            "rejects mass assignment of %s",
            async (field, value) => {
                expect(
                    (
                        await request("/register", "POST", {
                            ...validRegister,
                            [field]: value,
                        })
                    ).status,
                ).toBe(400);
                expect(passwords.hash).not.toHaveBeenCalled();
                expect(prisma.user.create).not.toHaveBeenCalled();
            },
        );

        it.each(["email", "phone"])(
            "returns the same generic 409 for duplicate %s",
            async (target) => {
                prisma.user.create.mockRejectedValue(
                    prismaError("P2002", target),
                );

                const response = await request(
                    "/register",
                    "POST",
                    validRegister,
                );

                expect(response.status).toBe(409);
                expect(response.body).toEqual({
                    statusCode: 409,
                    error: "Conflict",
                    message: "An account with these details already exists",
                });
                expect(tokens.issue).not.toHaveBeenCalled();
            },
        );
    });

    describe("POST /users/login", () => {
        beforeEach(() => {
            prisma.user.findUnique.mockResolvedValue({
                ...profile,
                passwordHash,
            });
        });

        it("normalizes email and returns 200 with a safe profile and a 900-second bearer token", async () => {
            const response = await request("/login", "POST", {
                ...validLogin,
                email: "  ALICE@EXAMPLE.COM  ",
            });

            expect(response).toMatchObject({
                status: 200,
                body: authResponse,
                cacheControl: "no-store",
            });
            expect(response.body).toEqual(authResponse);
            expect(response.body).not.toHaveProperty("refreshToken");
            expect(response.body).not.toHaveProperty("refreshExpiresAt");
            expect(response.setCookie).toContain(
                `__Secure-reown_refresh=${session.refreshToken}`,
            );
            expect(response.setCookie).toContain("HttpOnly");
            expect(response.setCookie).toContain("Path=/api/v1/auth");
            expect(sessions.create).toHaveBeenCalledWith(userId);
            expect(response.body).not.toHaveProperty("user.passwordHash");
            expect(response.body).not.toHaveProperty("user.password");
            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { email: "alice@example.com" },
                select: { ...safeSelect, passwordHash: true },
            });
            expect(passwords.verify).toHaveBeenCalledTimes(1);
            expect(passwords.verify).toHaveBeenCalledWith(
                validLogin.password,
                passwordHash,
            );
            expect(tokens.issue).toHaveBeenCalledTimes(1);
            expect(tokens.issue).toHaveBeenCalledWith(userId, familyId);
            expect(passwords.hash).not.toHaveBeenCalled();
        });

        it.each(["p", "p".repeat(128), "  password  "])(
            "accepts and preserves a valid login password: %s",
            async (password) => {
                expect(
                    (
                        await request("/login", "POST", {
                            ...validLogin,
                            password,
                        })
                    ).status,
                ).toBe(200);
                expect(passwords.verify).toHaveBeenCalledWith(
                    password,
                    passwordHash,
                );
            },
        );

        it.each([
            [
                "canonical email",
                { identifier: " ALICE@EXAMPLE.COM " },
                { email: profile.email },
            ],
            [
                "canonical phone",
                { identifier: " +84901234567 " },
                { phone: profile.phone },
            ],
            [
                "legacy phone",
                { phone: " +84901234567 " },
                { phone: profile.phone },
            ],
        ])(
            "normalizes %s to a single lookup",
            async (_label, identifier, where) => {
                const response = await request("/login", "POST", {
                    ...identifier,
                    password: validLogin.password,
                });
                expect(response.status).toBe(200);
                expect(response.body).toEqual(authResponse);
                expect(prisma.user.findUnique).toHaveBeenCalledWith({
                    where,
                    select: { ...safeSelect, passwordHash: true },
                });
            },
        );

        it.each([
            [
                "canonical plus email alias",
                {
                    identifier: profile.email,
                    email: profile.email,
                    password: validLogin.password,
                },
            ],
            [
                "canonical plus phone alias",
                {
                    identifier: profile.phone,
                    phone: profile.phone,
                    password: validLogin.password,
                },
            ],
            [
                "both legacy aliases",
                {
                    email: profile.email,
                    phone: profile.phone,
                    password: validLogin.password,
                },
            ],
            [
                "invalid identifier",
                {
                    identifier: "not-an-identifier",
                    password: validLogin.password,
                },
            ],
            [
                "invalid phone identifier",
                { identifier: "+012345678", password: validLogin.password },
            ],
            [
                "null identifier",
                { identifier: null, password: validLogin.password },
            ],
            [
                "non-text identifier",
                { identifier: 42, password: validLogin.password },
            ],
            ["empty body", {}],
            ["missing email", { password: validLogin.password }],
            ["missing password", { email: validLogin.email }],
            ["invalid email", { ...validLogin, email: "not-an-email" }],
            ["long email", { ...validLogin, email: `${emailAtLimit}d` }],
            ["empty password", { ...validLogin, password: "" }],
            ["long password", { ...validLogin, password: "p".repeat(129) }],
            ["non-text password", { ...validLogin, password: 42 }],
            ["unexpected role", { ...validLogin, role: "admin" }],
            ["unexpected displayName", { ...validLogin, displayName: "Alice" }],
            ["supplied hash", { ...validLogin, passwordHash }],
        ])(
            "rejects %s before querying or verifying passwords",
            async (_label, body) => {
                expect((await request("/login", "POST", body)).status).toBe(
                    400,
                );
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
                expect(passwords.verify).not.toHaveBeenCalled();
                expect(tokens.issue).not.toHaveBeenCalled();
            },
        );

        it.each([
            ["unknown email", null, false, undefined],
            [
                "wrong password",
                { ...profile, passwordHash },
                false,
                passwordHash,
            ],
            [
                "locked account",
                { ...profile, status: "locked", passwordHash },
                true,
                passwordHash,
            ],
        ])(
            "returns an identical generic 401 for %s",
            async (_label, user, valid, hash) => {
                prisma.user.findUnique.mockResolvedValue(user);
                passwords.verify.mockResolvedValue(valid);

                const response = await request("/login", "POST", validLogin);

                expect(response.status).toBe(401);
                expect(response.body).toEqual({
                    statusCode: 401,
                    error: "Unauthorized",
                    message: "Invalid credentials",
                });
                expect(passwords.verify).toHaveBeenCalledTimes(1);
                expect(passwords.verify).toHaveBeenCalledWith(
                    validLogin.password,
                    hash,
                );
                expect(tokens.issue).not.toHaveBeenCalled();
            },
        );
    });

    describe("current-account authentication", () => {
        it.each(["GET", "PATCH"])(
            "rejects a revoked family before loading the user on %s",
            async (method) => {
                sessions.assertActive.mockRejectedValue(
                    new UnauthorizedException(),
                );
                const response = await request(
                    "/me",
                    method,
                    method === "PATCH" ? { displayName: "Updated" } : undefined,
                    "Bearer valid-token",
                );
                expect(response.status).toBe(401);
                expect(tokens.verify).toHaveBeenCalledWith("valid-token");
                expect(sessions.assertActive).toHaveBeenCalledWith(
                    userId,
                    familyId,
                );
                expect(tokens.verify.mock.invocationCallOrder[0]).toBeLessThan(
                    sessions.assertActive.mock.invocationCallOrder[0],
                );
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
                expect(prisma.user.update).not.toHaveBeenCalled();
            },
        );

        it.each(["GET", "PATCH"])(
            "does not use a refresh cookie as authentication on %s",
            async (method) => {
                const response = await request(
                    "/me",
                    method,
                    method === "PATCH" ? { displayName: "Updated" } : undefined,
                    undefined,
                    {
                        Cookie: `__Secure-reown_refresh=${session.refreshToken}`,
                    },
                );
                expect(response.status).toBe(401);
                expect(tokens.verify).not.toHaveBeenCalled();
                expect(sessions.assertActive).not.toHaveBeenCalled();
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
            },
        );

        it.each(["GET", "PATCH"])(
            "rejects %s /users/me without a bearer token",
            async (method) => {
                expect(
                    (
                        await request(
                            "/me",
                            method,
                            method === "PATCH"
                                ? { displayName: "Updated" }
                                : undefined,
                        )
                    ).status,
                ).toBe(401);
                expect(tokens.verify).not.toHaveBeenCalled();
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
                expect(prisma.user.update).not.toHaveBeenCalled();
                expect(sessions.assertActive).not.toHaveBeenCalled();
            },
        );

        it.each([
            "Basic credentials",
            "Bearer",
            "Bearer token extra",
            `Bearer ${"a".repeat(4096)}`,
        ])(
            "rejects a malformed authorization header: %s",
            async (authorization) => {
                expect(
                    (await request("/me", "GET", undefined, authorization))
                        .status,
                ).toBe(401);
                expect(tokens.verify).not.toHaveBeenCalled();
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
            },
        );

        it.each(["GET", "PATCH"])(
            "rejects an invalid or expired token on %s /users/me",
            async (method) => {
                tokens.verify.mockImplementation(() => {
                    throw new UnauthorizedException(
                        "Invalid or expired access token",
                    );
                });

                const response = await request(
                    "/me",
                    method,
                    method === "PATCH" ? { displayName: "Updated" } : undefined,
                    "Bearer invalid-token",
                );

                expect(response.status).toBe(401);
                expect(tokens.verify).toHaveBeenCalledTimes(1);
                expect(tokens.verify).toHaveBeenCalledWith("invalid-token");
                expect(prisma.user.findUnique).not.toHaveBeenCalled();
                expect(prisma.user.update).not.toHaveBeenCalled();
                expect(sessions.assertActive).not.toHaveBeenCalled();
            },
        );

        it.each([
            ["GET", "missing", null],
            ["GET", "locked", { ...profile, status: "locked" }],
            ["PATCH", "missing", null],
            ["PATCH", "locked", { ...profile, status: "locked" }],
        ])(
            "rejects %s /users/me when the token account is %s",
            async (method, _label, user) => {
                prisma.user.findUnique.mockResolvedValue(user);

                const response = await request(
                    "/me",
                    method,
                    method === "PATCH" ? { displayName: "Updated" } : undefined,
                    "Bearer valid-token",
                );

                expect(response.status).toBe(401);
                expect(response.body).toMatchObject({
                    message: "Account is unavailable",
                });
                expect(tokens.verify).toHaveBeenCalledTimes(1);
                expect(tokens.verify).toHaveBeenCalledWith("valid-token");
                expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
                expect(prisma.user.findUnique).toHaveBeenCalledWith({
                    where: { id: userId },
                    select: safeSelect,
                });
                expect(prisma.user.update).not.toHaveBeenCalled();
            },
        );
    });

    describe("GET /users/me", () => {
        it("uses the verified token subject to load the active profile without password data", async () => {
            const response = await request(
                "/me",
                "GET",
                undefined,
                "Bearer valid-token",
            );

            expect(response).toMatchObject({
                status: 200,
                body: profile,
                cacheControl: "no-store",
            });
            expect(response.body).not.toHaveProperty("passwordHash");
            expect(response.body).not.toHaveProperty("password");
            expect(tokens.verify).toHaveBeenCalledTimes(1);
            expect(tokens.verify).toHaveBeenCalledWith("valid-token");
            expect(sessions.assertActive).toHaveBeenCalledWith(
                userId,
                familyId,
            );
            expect(tokens.verify.mock.invocationCallOrder[0]).toBeLessThan(
                sessions.assertActive.mock.invocationCallOrder[0],
            );
            expect(
                sessions.assertActive.mock.invocationCallOrder[0],
            ).toBeLessThan(prisma.user.findUnique.mock.invocationCallOrder[0]);
            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: userId },
                select: safeSelect,
            });
            expect(prisma.user.update).not.toHaveBeenCalled();
        });
    });

    describe("PATCH /users/me", () => {
        it("updates only the token account, ignoring a different query id, and trims displayName", async () => {
            const updated = { ...profile, displayName: "Alice Updated" };
            prisma.user.update.mockResolvedValue(updated);

            const response = await request(
                `/me?id=${otherUserId}`,
                "PATCH",
                { displayName: "  Alice Updated  " },
                "Bearer valid-token",
            );

            expect(response).toMatchObject({
                status: 200,
                body: updated,
                cacheControl: "no-store",
            });
            expect(response.body).not.toHaveProperty("passwordHash");
            expect(response.body).not.toHaveProperty("password");
            expect(tokens.verify).toHaveBeenCalledTimes(1);
            expect(tokens.verify).toHaveBeenCalledWith("valid-token");
            expect(sessions.assertActive).toHaveBeenCalledWith(
                userId,
                familyId,
            );
            expect(tokens.verify.mock.invocationCallOrder[0]).toBeLessThan(
                sessions.assertActive.mock.invocationCallOrder[0],
            );
            expect(
                sessions.assertActive.mock.invocationCallOrder[0],
            ).toBeLessThan(prisma.user.findUnique.mock.invocationCallOrder[0]);
            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: userId },
                select: safeSelect,
            });
            expect(prisma.user.update).toHaveBeenCalledTimes(1);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: userId, status: "active" },
                data: { displayName: "Alice Updated" },
                select: safeSelect,
            });
            expect(passwords.hash).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
        });

        it.each(["A", "A".repeat(100)])(
            "accepts a displayName at a valid length boundary: %s",
            async (displayName) => {
                expect(
                    (
                        await request(
                            "/me",
                            "PATCH",
                            { displayName },
                            "Bearer valid-token",
                        )
                    ).status,
                ).toBe(200);
                expect(prisma.user.update).toHaveBeenCalledWith({
                    where: { id: userId, status: "active" },
                    data: { displayName },
                    select: safeSelect,
                });
            },
        );

        it.each([
            ["empty patch", {}],
            ["blank name", { displayName: "   " }],
            ["long name", { displayName: "a".repeat(101) }],
            ["null name", { displayName: null }],
            ["non-text name", { displayName: 42 }],
            ["array body", []],
        ])("rejects %s without updating the account", async (_label, body) => {
            expect(
                (await request("/me", "PATCH", body, "Bearer valid-token"))
                    .status,
            ).toBe(400);
            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it.each(
            Object.entries({
                ...privilegedFields,
                email: "attacker@example.com",
                phone: "+12345678901",
                password: "replacement-password",
            }),
        )(
            "rejects mass assignment of %s even alongside a valid displayName",
            async (field, value) => {
                const response = await request(
                    "/me",
                    "PATCH",
                    { displayName: "Updated", [field]: value },
                    "Bearer valid-token",
                );

                expect(response.status).toBe(400);
                expect(prisma.user.update).not.toHaveBeenCalled();
                expect(passwords.hash).not.toHaveBeenCalled();
            },
        );

        it("returns 401 if the account disappears or becomes inactive between guard lookup and update", async () => {
            prisma.user.update.mockRejectedValue(prismaError("P2025"));

            const response = await request(
                "/me",
                "PATCH",
                { displayName: "Updated" },
                "Bearer valid-token",
            );

            expect(response.status).toBe(401);
            expect(response.body).toMatchObject({
                message: "Account is unavailable",
            });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: userId, status: "active" },
                data: { displayName: "Updated" },
                select: safeSelect,
            });
        });
    });

    describe("personal-account route scope", () => {
        it.each([
            ["GET", ""],
            ["POST", ""],
            ["GET", `/${otherUserId}`],
            ["PATCH", `/${otherUserId}`],
            ["GET", "/admin"],
            ["GET", "/list"],
        ])("does not expose %s /users%s", async (method, path) => {
            expect(
                (await request(path, method, undefined, "Bearer valid-token"))
                    .status,
            ).toBe(404);
            expect(tokens.verify).not.toHaveBeenCalled();
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
            expect(prisma.user.create).not.toHaveBeenCalled();
            expect(prisma.user.update).not.toHaveBeenCalled();
        });
    });
});
