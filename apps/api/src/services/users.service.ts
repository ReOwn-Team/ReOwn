import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import type {
    LoginUserDto,
    RegisterUserDto,
    UpdateUserDto,
} from "../dtos/user.dto";
import {
    ACTIVE_USER_STATUS,
    userProfileSelect,
    UserRoles,
} from "../models/user.model";
import type { AuthSessionResult, UserProfile } from "../models/user.model";
import type { SessionGrant } from "../models/session.model";
import { SessionsService } from "./sessions.service";
import { PrismaService } from "../prisma/prisma.service";
import {
    ACCESS_TOKEN_TTL_SECONDS,
    AccessTokenProvider,
} from "../providers/access-token.provider";
import { PasswordProvider } from "../providers/password.provider";

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly passwords: PasswordProvider,
        private readonly tokens: AccessTokenProvider,
        private readonly sessions: SessionsService,
    ) {}

    private sessionResponse(
        user: UserProfile,
        session: SessionGrant,
    ): AuthSessionResult {
        return {
            auth: {
                user,
                accessToken: this.tokens.issue(user.id, session.familyId),
                tokenType: "Bearer",
                expiresIn: ACCESS_TOKEN_TTL_SECONDS,
            },
            refreshToken: session.refreshToken,
            refreshExpiresAt: session.expiresAt,
        };
    }

    private async authenticate(user: UserProfile): Promise<AuthSessionResult> {
        return this.sessionResponse(user, await this.sessions.create(user.id));
    }

    async register(dto: RegisterUserDto): Promise<AuthSessionResult> {
        const passwordHash = await this.passwords.hash(dto.password);
        try {
            const user = await this.prisma.user.create({
                data: {
                    displayName: dto.displayName,
                    email: dto.email,
                    phone: dto.phone,
                    passwordHash,
                    phoneVerified: 0,
                    emailVerified: 0,
                    kycStatus: 0,
                    role: UserRoles.USER,
                    status: ACTIVE_USER_STATUS,
                },
                select: userProfileSelect,
            });
            return this.authenticate(user);
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                throw new ConflictException(
                    "An account with these details already exists",
                );
            }
            throw error;
        }
    }

    async verifyCredentials(dto: LoginUserDto) {
        const user = await this.prisma.user.findUnique({
            where: dto.identifier.includes("@")
                ? { email: dto.identifier }
                : { phone: dto.identifier },
            select: { ...userProfileSelect, passwordHash: true },
        });
        const validPassword = await this.passwords.verify(
            dto.password,
            user?.passwordHash,
        );
        if (!user || !validPassword || user.status !== ACTIVE_USER_STATUS) {
            throw new UnauthorizedException("Invalid credentials");
        }
        const { passwordHash, ...profile } = user;
        return { user: profile, passwordHash };
    }

    async login(dto: LoginUserDto): Promise<AuthSessionResult> {
        const { user } = await this.verifyCredentials(dto);
        return this.authenticate(user);
    }
    async prepareRegistration(dto: RegisterUserDto) {
        const existing = await this.prisma.user.findFirst({
            where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
            select: { id: true },
        });
        if (existing)
            throw new ConflictException(
                "An account with these details already exists",
            );
        return {
            displayName: dto.displayName,
            email: dto.email,
            phone: dto.phone,
            passwordHash: await this.passwords.hash(dto.password),
        };
    }
    async completeRegistration(value: {
        displayName: string;
        email: string;
        phone: string;
        passwordHash: string;
    }) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const user = await tx.user.create({
                    data: {
                        displayName: value.displayName,
                        email: value.email,
                        phone: value.phone,
                        passwordHash: value.passwordHash,
                        phoneVerified: 0,
                        emailVerified: 1,
                        kycStatus: 0,
                        role: UserRoles.USER,
                        status: ACTIVE_USER_STATUS,
                    },
                    select: userProfileSelect,
                });
                return this.sessionResponse(
                    user,
                    await this.sessions.create(user.id, tx),
                );
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            )
                throw new ConflictException(
                    "An account with these details already exists",
                );
            throw error;
        }
    }
    async completeOtpLogin(id: string, email: string, fingerprint: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: { ...userProfileSelect, passwordHash: true },
        });
        if (
            !user ||
            user.status !== ACTIVE_USER_STATUS ||
            user.email !== email ||
            createHash("sha256").update(user.passwordHash).digest("hex") !==
                fingerprint
        )
            throw new UnauthorizedException("Account credentials changed");
        const profile = await this.prisma.user.update({
            where: { id, status: ACTIVE_USER_STATUS },
            data: { emailVerified: 1 },
            select: userProfileSelect,
        });
        return this.authenticate(profile);
    }

    async refresh(refreshToken: string): Promise<AuthSessionResult> {
        const session = await this.sessions.rotate(refreshToken);
        try {
            const user = await this.findActiveProfile(session.userId);
            return this.sessionResponse(user, session);
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                await this.sessions.revoke(session.refreshToken);
            }
            throw error;
        }
    }

    logout(refreshToken: string): Promise<void> {
        return this.sessions.revoke(refreshToken);
    }

    async findActiveProfile(id: string): Promise<UserProfile> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: userProfileSelect,
        });
        if (!user || user.status !== ACTIVE_USER_STATUS) {
            throw new UnauthorizedException("Account is unavailable");
        }
        return user;
    }

    async updateMe(id: string, dto: UpdateUserDto): Promise<UserProfile> {
        try {
            return await this.prisma.user.update({
                where: { id, status: ACTIVE_USER_STATUS },
                data: { displayName: dto.displayName },
                select: userProfileSelect,
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2025"
            ) {
                throw new UnauthorizedException("Account is unavailable");
            }
            throw error;
        }
    }
}
