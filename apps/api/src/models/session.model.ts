export interface SessionGrant {
    userId: string;
    familyId: string;
    refreshToken: string;
    expiresAt: Date;
}

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
