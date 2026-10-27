import type { Prisma } from "../generated/prisma/client";

export const userProfileSelect = {
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
} satisfies Prisma.UserSelect;

export type UserProfile = Prisma.UserGetPayload<{
    select: typeof userProfileSelect;
}>;

export interface AuthResponse {
    user: UserProfile;
    accessToken: string;
    tokenType: "Bearer";
    expiresIn: number;
}

// Internal service result: controllers send auth as JSON and refreshToken only as an HttpOnly cookie.
export interface AuthSessionResult {
    auth: AuthResponse;
    refreshToken: string;
    refreshExpiresAt: Date;
}

export enum UserRoles {
    USER = "user",
    ADMIN = "admin",
}
export const ACTIVE_USER_STATUS = "active";
