import {
    Controller,
    Header,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UnauthorizedException,
    UseGuards,
} from "@nestjs/common";
import {
    ApiOperation,
    ApiResponse,
    ApiSecurity,
    ApiTags,
} from "@nestjs/swagger";
import {
    ApiAuthSuccess,
    ApiCsrfHeaders,
    ApiErrors,
    ApiRefreshCookie,
} from "../openapi/decorators";
import type { Request, Response } from "express";
import { CookieCsrfGuard } from "../guards/cookie-csrf.guard";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";
import { UsersService } from "../services/users.service";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
@UseGuards(CookieCsrfGuard)
export class AuthController {
    constructor(
        private readonly users: UsersService,
        private readonly cookies: AuthCookieProvider,
    ) {}

    @ApiOperation({
        operationId: "authRefresh",
        summary: "Rotate the refresh token",
        description:
            "Reads only the HttpOnly refresh cookie. Atomically revokes the old token and sets its successor without extending the 30-day absolute expiry. Reuse revokes the whole family. Serialize refresh calls, including across browser tabs; do not blindly retry after a lost response. A 401 clears the cookie; 403/500 do not.",
    })
    @ApiCsrfHeaders()
    @ApiRefreshCookie()
    @ApiAuthSuccess(200)
    @ApiErrors(401, 403, 429, 500)
    @Post("refresh")
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        try {
            const token = this.cookies.read(request);
            if (!token) {
                throw new UnauthorizedException();
            }
            const result = await this.users.refresh(token);
            this.cookies.set(
                response,
                result.refreshToken,
                result.refreshExpiresAt,
            );
            return result.auth;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                this.cookies.clear(response);
            }
            throw error;
        }
    }

    @ApiOperation({
        operationId: "authLogout",
        summary: "Log out the current session family",
        description:
            "Revokes all live tokens in the cookie's family, immediately invalidating its access tokens. Missing or unknown cookie is idempotent. Other login families are unaffected. Requires CSRF headers even without a cookie.",
    })
    @ApiCsrfHeaders()
    @ApiRefreshCookie()
    @ApiSecurity({})
    @ApiResponse({
        status: 204,
        description:
            "Session family revoked (if found) and refresh cookie cleared. No response body.",
        headers: {
            "Set-Cookie": {
                description:
                    "Expires the refresh cookie with the same name and path.",
                schema: { type: "string" },
            },
            "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
        },
    })
    @ApiErrors(403, 429, 500)
    @Post("logout")
    @HttpCode(HttpStatus.NO_CONTENT)
    @Header("Cache-Control", "no-store")
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        const token = this.cookies.read(request);
        if (token) {
            await this.users.logout(token);
        }
        this.cookies.clear(response);
    }
}
