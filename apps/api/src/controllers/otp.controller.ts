import {
    Body,
    Controller,
    Header,
    HttpCode,
    HttpException,
    Post,
    Res,
    UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { OtpAuthService } from "../otp/otp-auth.service";
import {
    otpResendSchema,
    otpVerifySchema,
    type OtpVerifyDto,
} from "../dtos/otp.dto";
import { CookieCsrfGuard } from "../guards/cookie-csrf.guard";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import {
    ApiAuthSuccess,
    ApiCsrfHeaders,
    ApiErrors,
    ApiRequestBody,
} from "../openapi/decorators";
export function otpRetryHeader(error: unknown, response: Response) {
    if (error instanceof HttpException && error.getStatus() === 429) {
        const body = error.getResponse();
        if (typeof body === "object" && "retryAfter" in body)
            response.setHeader(
                "Retry-After",
                String(
                    Math.min(3600, Math.max(1, Number(body.retryAfter) || 60)),
                ),
            );
    }
    throw error;
}
@ApiTags("auth")
@Controller({ path: "auth/otp", version: "1" })
@UseGuards(CookieCsrfGuard)
export class OtpController {
    constructor(
        private readonly otp: OtpAuthService,
        private readonly cookies: AuthCookieProvider,
    ) {}
    @Post("verify")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "authOtpVerify",
        summary: "Verify a single-use email OTP and create a session",
    })
    @ApiRequestBody("OtpVerifyRequest")
    @ApiCsrfHeaders()
    @ApiAuthSuccess(200)
    @ApiErrors(400, 401, 403, 409, 429, 500, 503)
    async verify(
        @Body(new ZodValidationPipe(otpVerifySchema)) dto: OtpVerifyDto,
        @Res({ passthrough: true }) response: Response,
    ) {
        const result = await this.otp.verify(dto);
        this.cookies.set(
            response,
            result.refreshToken,
            result.refreshExpiresAt,
        );
        return result.auth;
    }
    @Post("resend")
    @HttpCode(202)
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "authOtpResend",
        summary: "Send a new OTP, invalidating the previous code",
    })
    @ApiRequestBody("OtpResendRequest")
    @ApiCsrfHeaders()
    @ApiResponse({
        status: 202,
        schema: { $ref: "#/components/schemas/OtpChallenge" },
    })
    @ApiErrors(400, 401, 403, 429, 500, 503)
    async resend(
        @Body(new ZodValidationPipe(otpResendSchema))
        dto: { challengeId: string },
        @Res({ passthrough: true }) response: Response,
    ) {
        try {
            return await this.otp.resend(dto.challengeId);
        } catch (error) {
            return otpRetryHeader(error, response);
        }
    }
}
