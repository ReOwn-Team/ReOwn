import { HcaptchaGuard } from "../captcha/hcaptcha.guard";
import { OtpAuthService } from "../otp/otp-auth.service";
import { otpRetryHeader } from "./otp.controller";
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
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiTags,
    ApiResponse,
} from "@nestjs/swagger";
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
        private readonly otp: OtpAuthService,
    ) {}

    @ApiOperation({
        operationId: "usersRegister",
        summary: "Register a personal account",
        description:
            "Sends a registration OTP. No user or session is created until email verification succeeds. Requires exact Origin and X-ReOwn-Client headers.",
    })
    @ApiRequestBody("RegisterUserRequest")
    @ApiCsrfHeaders()
    @ApiHeader({name:"X-HCaptcha-Response",required:true,description:"Fresh hCaptcha response token; verified on the server before sending an OTP.",schema:{type:"string"}})
    @ApiResponse({
        status: 202,
        schema: { $ref: "#/components/schemas/OtpChallenge" },
        headers: {
            "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
        },
    })
    @ApiErrors(400, 403, 409, 429, 500, 503)
    @Post("register")
    @HttpCode(HttpStatus.ACCEPTED)
    @UseGuards(CookieCsrfGuard, HcaptchaGuard)
    @Header("Cache-Control", "no-store")
    async register(
        @Body(new ZodValidationPipe(registerUserSchema)) dto: RegisterUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        try {
            return await this.otp.register(dto);
        } catch (error) {
            return otpRetryHeader(error, response);
        }
    }

    @ApiOperation({
        operationId: "usersLogin",
        summary: "Log in with email or phone and password",
        description:
            "Validates identifier/password and sends an OTP to the account email. Does not create a session. Legacy email/password and phone/password inputs remain supported.",
    })
    @ApiRequestBody("LoginUserRequest")
    @ApiCsrfHeaders()
    @ApiHeader({name:"X-HCaptcha-Response",required:true,description:"Fresh hCaptcha response token; verified on the server before sending an OTP.",schema:{type:"string"}})
    @ApiResponse({
        status: 202,
        schema: { $ref: "#/components/schemas/OtpChallenge" },
        headers: {
            "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
        },
    })
    @ApiErrors(400, 401, 403, 429, 500, 503)
    @Post("login")
    @UseGuards(CookieCsrfGuard, HcaptchaGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @Header("Cache-Control", "no-store")
    async login(
        @Body(new ZodValidationPipe(loginUserSchema)) dto: LoginUserDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        try {
            return await this.otp.login(dto);
        } catch (error) {
            return otpRetryHeader(error, response);
        }
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
