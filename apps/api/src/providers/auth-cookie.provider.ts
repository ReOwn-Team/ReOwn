import { Injectable } from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

@Injectable()
export class AuthCookieProvider {
    readonly clientOrigin: string;
    readonly secure: boolean;
    readonly sameSite: "lax" | "strict" | "none";
    readonly cookieName: string;
    private readonly options: CookieOptions;

    constructor() {
        const production = process.env.NODE_ENV === "production";
        const origin = process.env.CLIENT_ORIGIN ?? (production ? "" : "http://localhost:5173");
        let url: URL;
        try {
            url = new URL(origin);
        } catch {
            throw new Error("CLIENT_ORIGIN must be an exact HTTP(S) origin");
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || (production && url.protocol !== "https:")) {
            throw new Error("CLIENT_ORIGIN must be an exact origin without a path; production requires HTTPS");
        }
        const secure = process.env.COOKIE_SECURE ?? "true";
        if (secure !== "true" && secure !== "false") {
            throw new Error("COOKIE_SECURE must be true or false");
        }
        this.secure = secure === "true";
        if (production && !this.secure) {
            throw new Error("Refresh cookies must be Secure in production");
        }
        if (!this.secure && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
            throw new Error("Insecure refresh cookies are only allowed for explicit localhost development");
        }
        const sameSite = process.env.COOKIE_SAMESITE ?? "lax";
        if (sameSite !== "lax" && sameSite !== "strict" && sameSite !== "none") {
            throw new Error("COOKIE_SAMESITE must be lax, strict or none");
        }
        if (sameSite === "none" && !this.secure) {
            throw new Error("SameSite=None requires Secure refresh cookies");
        }
        this.clientOrigin = origin;
        this.sameSite = sameSite;
        this.cookieName = this.secure ? "__Secure-reown_refresh" : "reown_refresh";
        this.options = {
            httpOnly: true,
            secure: this.secure,
            sameSite: this.sameSite,
            path: "/api/v1/auth",
        };
    }

    read(request: Request): string | undefined {
        const value: unknown = request.cookies?.[this.cookieName];
        return typeof value === "string" ? value : undefined;
    }

    set(response: Response, token: string, expiresAt: Date): void {
        response.cookie(this.cookieName, token, { ...this.options, expires: expiresAt });
    }

    clear(response: Response): void {
        response.clearCookie(this.cookieName, this.options);
    }
}
