import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Patch,
    Post,
    Res,
    UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../decorators/current-user.decorator";
import { CookieCsrfGuard } from "../guards/cookie-csrf.guard";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";
import {
    loginUserSchema,
    registerUserSchema,
    updateUserSchema,
} from "../dtos/user.dto";
import type {
    LoginUserDto,
    RegisterUserDto,
    UpdateUserDto,
} from "../dtos/user.dto";
import { AccessTokenGuard } from "../guards/access-token.guard";
import type { UserProfile } from "../models/user.model";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { UsersService } from "../services/users.service";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
    ApiAuthSuccess,
    ApiCsrfHeaders,
    ApiErrors,
    ApiProfileSuccess,
    ApiRequestBody,
} from "../openapi/decorators";

@ApiTags("users")
@Controller({
    path: "users",
    version: "1",
})
export class UsersController {
    constructor(
        private readonly users: UsersService,
        private readonly cookies: AuthCookieProvider,
    ) {}

    @ApiOperation({
        operationId: "usersRegister",
        summary: "Register a personal account",
        description:
            "Creates an unverified user and a new 30-day absolute session family. Requires exact Origin and X-ReOwn-Client headers. Refresh token is cookie-only.",
    })
    @ApiRequestBody("RegisterUserRequest")
    @ApiCsrfHeaders()
    @ApiAuthSuccess(201)
    @ApiErrors(400, 403, 409, 429, 500)
    @Post("register")
    @UseGuards(CookieCsrfGuard)
    @Header("Cache-Control", "no-store")
    async register(
        @Body(new ZodValidationPipe(registerUserSchema)) dto: RegisterUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.users.register(dto);
        this.cookies.set(
            response,
            result.refreshToken,
            result.refreshExpiresAt,
        );
        return result.auth;
    }

    @ApiOperation({
        operationId: "usersLogin",
        summary: "Log in with email or phone and password",
        description:
            "Send identifier plus password. Legacy email/password or phone/password forms remain supported; do not mix identifier forms. Login failures return the same generic 401. Shares a 10-request/15-minute/IP limit with registration.",
    })
    @ApiRequestBody("LoginUserRequest")
    @ApiCsrfHeaders()
    @ApiAuthSuccess(200)
    @ApiErrors(400, 401, 403, 429, 500)
    @Post("login")
    @UseGuards(CookieCsrfGuard)
    @HttpCode(HttpStatus.OK)
    @Header("Cache-Control", "no-store")
    async login(
        @Body(new ZodValidationPipe(loginUserSchema)) dto: LoginUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.users.login(dto);
        this.cookies.set(
            response,
            result.refreshToken,
            result.refreshExpiresAt,
        );
        return result.auth;
    }

    @ApiOperation({
        operationId: "usersGetMe",
        summary: "Read my private profile",
        description:
            "Identity comes only from the verified JWT. The user and session family must still be active.",
    })
    @ApiProfileSuccess()
    @ApiErrors(401, 500)
    @Get("me")
    @ApiBearerAuth("accessToken")
    @UseGuards(AccessTokenGuard)
    @Header("Cache-Control", "no-store")
    getMe(@CurrentUser() user: UserProfile) {
        return user;
    }

    @ApiOperation({
        operationId: "usersUpdateMe",
        summary: "Update my display name",
        description:
            "Only displayName may be changed. IDs, email, phone, role, status, password and verification fields are rejected.",
    })
    @ApiRequestBody("UpdateUserRequest")
    @ApiProfileSuccess()
    @ApiErrors(400, 401, 500)
    @Patch("me")
    @ApiBearerAuth("accessToken")
    @UseGuards(AccessTokenGuard)
    @Header("Cache-Control", "no-store")
    updateMe(
        @CurrentUser() user: UserProfile,
        @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
    ) {
        return this.users.updateMe(user.id, dto);
    }
}
