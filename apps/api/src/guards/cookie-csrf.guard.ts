import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";

@Injectable()
export class CookieCsrfGuard implements CanActivate {
    constructor(private readonly cookies: AuthCookieProvider) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        if (
            request.headers.origin !== this.cookies.clientOrigin ||
            request.headers["x-reown-client"] !== "web"
        ) {
            throw new ForbiddenException("Origin and X-ReOwn-Client headers are required");
        }
        return true;
    }
}
