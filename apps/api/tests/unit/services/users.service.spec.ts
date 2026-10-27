import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from "@jest/globals";
import { Prisma } from "../../../src/generated/prisma/client";
import { UserRoles, type UserProfile } from "../../../src/models/user.model";
import { SessionsService } from "../../../src/services/sessions.service";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { AccessTokenProvider } from "../../../src/providers/access-token.provider";
import { PasswordProvider } from "../../../src/providers/password.provider";
import { UsersService } from "../../../src/services/users.service";

const userId = "f47221b7-a23b-44bb-9c42-cfc153728910";
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
const registerDto = {
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    password: "a secure password",
};
const loginDto = { identifier: profile.email, password: registerDto.password };
const familyId = "a2400f82-d6b8-4b56-a144-83abb002d939";
const session = {
    userId,
    familyId,
    refreshToken: "internal-refresh-token",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
};
const passwordHash = "stored-password-hash";
const authResponse = {
    user: profile,
    accessToken: "issued-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
};

const sessionResult = {
    auth: authResponse,
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.expiresAt,
};

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

describe("UsersService", () => {
    let module: TestingModule;
    let service: UsersService;
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
        rotate: jest.fn<SessionsService["rotate"]>(),
        revoke: jest.fn<SessionsService["revoke"]>(),
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        sessions.create.mockResolvedValue(session);
        sessions.rotate.mockResolvedValue(session);
        sessions.revoke.mockResolvedValue(undefined);
        passwords.hash.mockResolvedValue(passwordHash);
        passwords.verify.mockResolvedValue(true);
        tokens.issue.mockReturnValue(authResponse.accessToken);
        prisma.user.create.mockResolvedValue(profile);
        prisma.user.findUnique.mockResolvedValue({ ...profile, passwordHash });
        prisma.user.update.mockResolvedValue(profile);
        module = await Test.createTestingModule({
            providers: [
                UsersService,
                SessionsService,
                PrismaService,
                PasswordProvider,
                AccessTokenProvider,
            ],
        })
            .overrideProvider(SessionsService)
            .useValue(sessions)
            .overrideProvider(PrismaService)
            .useValue(prisma)
            .overrideProvider(PasswordProvider)
            .useValue(passwords)
            .overrideProvider(AccessTokenProvider)
            .useValue(tokens)
            .compile();
        service = module.get(UsersService);
    });

    afterEach(async () => {
        await module?.close();
    });

    describe("register", () => {
        it("hashes the password, sets account defaults, selects a safe profile and issues a 900-second token", async () => {
            const result = await service.register(registerDto);

            expect(result).toEqual(sessionResult);
            expect(sessions.create).toHaveBeenCalledTimes(1);
            expect(sessions.create).toHaveBeenCalledWith(userId);
            expect(result.auth.user).not.toHaveProperty("passwordHash");
            expect(passwords.hash).toHaveBeenCalledTimes(1);
            expect(passwords.hash).toHaveBeenCalledWith(registerDto.password);
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
        });

        it("does not mass assign extra properties even when called without the HTTP validation pipe", async () => {
            const untrustedDto = {
                ...registerDto,
                id: "another-user-id",
                role: "admin",
                status: "locked",
                emailVerified: 1,
                phoneVerified: 1,
                kycStatus: 1,
                avatarKey: "untrusted-avatar",
                passwordHash: "attacker-supplied-hash",
            };

            await service.register(untrustedDto);

            expect(prisma.user.create).toHaveBeenCalledWith({
                data: {
                    displayName: registerDto.displayName,
                    email: registerDto.email,
                    phone: registerDto.phone,
                    passwordHash,
                    phoneVerified: 0,
                    emailVerified: 0,
                    kycStatus: 0,
                    role: UserRoles.USER,
                    status: "active",
                },
                select: safeSelect,
            });
        });

        it.each(["email", "phone"])(
            "maps duplicate %s to the same generic 409",
            async (target) => {
                prisma.user.create.mockRejectedValue(
                    prismaError("P2002", target),
                );

                await expect(
                    service.register(registerDto),
                ).rejects.toMatchObject({
                    constructor: ConflictException,
                    status: 409,
                    message: "An account with these details already exists",
                });
                expect(tokens.issue).not.toHaveBeenCalled();
                expect(sessions.create).not.toHaveBeenCalled();
            },
        );

        it.each([
            prismaError("P2003"),
            new Error("Database unavailable"),
            Object.assign(new Error("Not a Prisma error"), { code: "P2002" }),
        ])(
            "rethrows unrelated create failures unchanged: %s",
            async (error) => {
                prisma.user.create.mockRejectedValue(error);

                await expect(service.register(registerDto)).rejects.toBe(error);
                expect(tokens.issue).not.toHaveBeenCalled();
                expect(sessions.create).not.toHaveBeenCalled();
            },
        );

        it("does not create an account when password hashing fails", async () => {
            const error = new Error("Hashing failed");
            passwords.hash.mockRejectedValue(error);

            await expect(service.register(registerDto)).rejects.toBe(error);
            expect(prisma.user.create).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.create).not.toHaveBeenCalled();
        });
    });

    describe("login", () => {
        it("looks up an E164 phone identifier", async () => {
            await expect(
                service.login({
                    identifier: profile.phone,
                    password: loginDto.password,
                }),
            ).resolves.toEqual(sessionResult);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { phone: profile.phone },
                select: { ...safeSelect, passwordHash: true },
            });
            expect(sessions.create).toHaveBeenCalledWith(userId);
            expect(tokens.issue).toHaveBeenCalledWith(userId, familyId);
        });

        it("does not issue a token when session creation fails", async () => {
            const error = new Error("Session storage unavailable");
            sessions.create.mockRejectedValue(error);
            await expect(service.login(loginDto)).rejects.toBe(error);
            expect(tokens.issue).not.toHaveBeenCalled();
        });

        it("selects the password hash only for verification and strips it before returning the profile", async () => {
            const result = await service.login(loginDto);

            expect(result).toEqual(sessionResult);
            expect(sessions.create).toHaveBeenCalledTimes(1);
            expect(sessions.create).toHaveBeenCalledWith(userId);
            expect(result.auth.user).not.toHaveProperty("passwordHash");
            expect(result.auth.user).not.toHaveProperty("password");
            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { email: loginDto.identifier },
                select: { ...safeSelect, passwordHash: true },
            });
            expect(passwords.verify).toHaveBeenCalledTimes(1);
            expect(passwords.verify).toHaveBeenCalledWith(
                loginDto.password,
                passwordHash,
            );
            expect(tokens.issue).toHaveBeenCalledTimes(1);
            expect(tokens.issue).toHaveBeenCalledWith(userId, familyId);
        });

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
            "returns the same generic 401 for %s",
            async (_label, user, valid, hash) => {
                prisma.user.findUnique.mockResolvedValue(user);
                passwords.verify.mockResolvedValue(valid);

                await expect(service.login(loginDto)).rejects.toMatchObject({
                    constructor: UnauthorizedException,
                    status: 401,
                    message: "Invalid credentials",
                });
                expect(passwords.verify).toHaveBeenCalledTimes(1);
                expect(passwords.verify).toHaveBeenCalledWith(
                    loginDto.password,
                    hash,
                );
                expect(tokens.issue).not.toHaveBeenCalled();
                expect(sessions.create).not.toHaveBeenCalled();
            },
        );

        it("rejects an unknown account even if password verification returns true", async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(service.login(loginDto)).rejects.toBeInstanceOf(
                UnauthorizedException,
            );
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.create).not.toHaveBeenCalled();
        });

        it("rethrows database failures rather than hiding them as invalid credentials", async () => {
            const error = new Error("Database unavailable");
            prisma.user.findUnique.mockRejectedValue(error);

            await expect(service.login(loginDto)).rejects.toBe(error);
            expect(passwords.verify).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.create).not.toHaveBeenCalled();
        });

        it("rethrows password provider failures without issuing a token", async () => {
            const error = new Error("Password verification failed");
            passwords.verify.mockRejectedValue(error);

            await expect(service.login(loginDto)).rejects.toBe(error);
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.create).not.toHaveBeenCalled();
        });
    });

    describe("refresh", () => {
        it("rotates before loading the active profile and signs the same session family", async () => {
            prisma.user.findUnique.mockResolvedValue(profile);
            await expect(service.refresh("old-refresh-token")).resolves.toEqual(
                sessionResult,
            );
            expect(sessions.rotate).toHaveBeenCalledWith("old-refresh-token");
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: userId },
                select: safeSelect,
            });
            expect(tokens.issue).toHaveBeenCalledWith(userId, familyId);
            expect(sessions.rotate.mock.invocationCallOrder[0]).toBeLessThan(
                prisma.user.findUnique.mock.invocationCallOrder[0],
            );
            expect(
                prisma.user.findUnique.mock.invocationCallOrder[0],
            ).toBeLessThan(tokens.issue.mock.invocationCallOrder[0]);
            expect(sessions.create).not.toHaveBeenCalled();
            expect(sessions.revoke).not.toHaveBeenCalled();
        });

        it("does not look up a profile or issue a token when rotation fails", async () => {
            const error = new UnauthorizedException();
            sessions.rotate.mockRejectedValue(error);
            await expect(service.refresh("replayed-token")).rejects.toBe(error);
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.revoke).not.toHaveBeenCalled();
        });

        it.each([null, { ...profile, status: "locked" }])(
            "revokes the rotated token if the profile is unavailable: %s",
            async (user) => {
                prisma.user.findUnique.mockResolvedValue(user);
                await expect(
                    service.refresh("old-refresh-token"),
                ).rejects.toBeInstanceOf(UnauthorizedException);
                expect(sessions.revoke).toHaveBeenCalledTimes(1);
                expect(sessions.revoke).toHaveBeenCalledWith(
                    session.refreshToken,
                );
                expect(tokens.issue).not.toHaveBeenCalled();
            },
        );

        it("preserves unexpected profile lookup failures without revoking the family", async () => {
            const error = new Error("Database unavailable");
            prisma.user.findUnique.mockRejectedValue(error);
            await expect(service.refresh("old-refresh-token")).rejects.toBe(
                error,
            );
            expect(sessions.revoke).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
        });
    });

    describe("logout", () => {
        it("delegates revocation and returns its promise", async () => {
            const result = service.logout("old-or-current-refresh-token");
            expect(result).toBe(sessions.revoke.mock.results[0].value);
            await expect(result).resolves.toBeUndefined();
            expect(sessions.revoke).toHaveBeenCalledWith(
                "old-or-current-refresh-token",
            );
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
        });

        it("propagates revocation failures", async () => {
            const error = new Error("Database unavailable");
            sessions.revoke.mockRejectedValue(error);
            await expect(service.logout("refresh-token")).rejects.toBe(error);
        });
    });

    describe("findActiveProfile", () => {
        it("looks up the current account by id with only safe profile fields", async () => {
            prisma.user.findUnique.mockResolvedValue(profile);

            await expect(service.findActiveProfile(userId)).resolves.toEqual(
                profile,
            );
            expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
            expect(prisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: userId },
                select: safeSelect,
            });
        });

        it.each([
            ["missing", null],
            ["locked", { ...profile, status: "locked" }],
        ])("rejects a %s account with 401", async (_label, user) => {
            prisma.user.findUnique.mockResolvedValue(user);

            await expect(
                service.findActiveProfile(userId),
            ).rejects.toMatchObject({
                constructor: UnauthorizedException,
                status: 401,
                message: "Account is unavailable",
            });
        });

        it("rethrows unrelated database failures unchanged", async () => {
            const error = new Error("Database unavailable");
            prisma.user.findUnique.mockRejectedValue(error);

            await expect(service.findActiveProfile(userId)).rejects.toBe(error);
        });
    });

    describe("updateMe", () => {
        it("updates only displayName for the specified active account and selects a safe profile", async () => {
            const updated = { ...profile, displayName: "Alice Updated" };
            prisma.user.update.mockResolvedValue(updated);
            const untrustedDto = {
                displayName: updated.displayName,
                id: "another-user-id",
                role: "admin",
                status: "locked",
                email: "attacker@example.com",
                phone: "+12345678901",
                password: "replacement-password",
                passwordHash: "replacement-hash",
                emailVerified: 1,
                phoneVerified: 1,
                kycStatus: 1,
                avatarKey: "untrusted-avatar",
            };

            await expect(
                service.updateMe(userId, untrustedDto),
            ).resolves.toEqual(updated);
            expect(prisma.user.update).toHaveBeenCalledTimes(1);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: userId, status: "active" },
                data: { displayName: updated.displayName },
                select: safeSelect,
            });
            expect(passwords.hash).not.toHaveBeenCalled();
            expect(tokens.issue).not.toHaveBeenCalled();
            expect(sessions.create).not.toHaveBeenCalled();
        });

        it("maps P2025 to 401 if the account disappears or is no longer active", async () => {
            prisma.user.update.mockRejectedValue(prismaError("P2025"));

            await expect(
                service.updateMe(userId, { displayName: "Alice Updated" }),
            ).rejects.toMatchObject({
                constructor: UnauthorizedException,
                status: 401,
                message: "Account is unavailable",
            });
        });

        it.each([
            prismaError("P2002"),
            new Error("Database unavailable"),
            Object.assign(new Error("Not a Prisma error"), { code: "P2025" }),
        ])(
            "rethrows unrelated update failures unchanged: %s",
            async (error) => {
                prisma.user.update.mockRejectedValue(error);

                await expect(
                    service.updateMe(userId, { displayName: "Alice Updated" }),
                ).rejects.toBe(error);
            },
        );
    });
});
