import { Injectable, UnauthorizedException } from "@nestjs/common";
import { sign, verify } from "jsonwebtoken";
import { z } from "zod";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = "reown-api";
const AUDIENCE = "reown-web";

@Injectable()
export class AccessTokenProvider {
    private readonly secret: string;

    constructor() {
        const secret = process.env.JWT_SECRET;
        if (!secret || Buffer.byteLength(secret.trim()) < 32) {
            throw new Error(
                "JWT_SECRET must contain at least 32 bytes; generate one with openssl rand -hex 32",
            );
        }
        this.secret = secret;
    }

    issue(userId: string, familyId: string): string {
        return sign({ sid: familyId }, this.secret, {
            algorithm: "HS256",
            subject: userId,
            issuer: ISSUER,
            audience: AUDIENCE,
            expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        });
    }

    verify(token: string): { userId: string; familyId: string } {
        try {
            const payload = verify(token, this.secret, {
                algorithms: ["HS256"],
                issuer: ISSUER,
                audience: AUDIENCE,
                maxAge: ACCESS_TOKEN_TTL_SECONDS,
            });
            if (
                typeof payload === "string" ||
                !z.string().uuid().safeParse(payload.sub).success ||
                !z.string().uuid().safeParse(payload.sid).success ||
                !Number.isInteger(payload.exp) ||
                !Number.isInteger(payload.iat)
            ) {
                throw new Error("Invalid access token claims");
            }
            return { userId: payload.sub!, familyId: payload.sid as string };
        } catch {
            throw new UnauthorizedException("Invalid or expired access token");
        }
    }
}
