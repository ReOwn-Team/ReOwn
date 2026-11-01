import { HcaptchaGuard } from "../captcha/hcaptcha.guard";
import { HcaptchaProvider } from "../captcha/hcaptcha.provider";
import { OtpController } from "../controllers/otp.controller";
import { OtpAuthService } from "../otp/otp-auth.service";
import { OtpStore } from "../otp/otp.store";
import { OtpMailProvider } from "../otp/otp-mail.provider";
import {
    MiddlewareConsumer,
    Module,
    NestModule,
    RequestMethod,
} from "@nestjs/common";
import { UsersController } from "../controllers/users.controller";
import { AuthController } from "../controllers/auth.controller";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";
import { CookieCsrfGuard } from "../guards/cookie-csrf.guard";
import { SessionsService } from "../services/sessions.service";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { createAuthRateLimit } from "../middlewares/auth-rate-limit.middleware";
import { PrismaModule } from "../prisma/prisma.module";
import { AccessTokenProvider } from "../providers/access-token.provider";
import { PasswordProvider } from "../providers/password.provider";
import { UsersService } from "../services/users.service";
import { RedisModule } from "../redis/redis.module";
import { RedisService } from "../redis/redis.service";

@Module({
    imports: [PrismaModule, RedisModule],
    controllers: [UsersController, AuthController, OtpController],
    providers: [
        HcaptchaGuard, HcaptchaProvider,
        OtpAuthService,
        OtpStore,
        OtpMailProvider,
        UsersService,
        SessionsService,
        PasswordProvider,
        AccessTokenProvider,
        AuthCookieProvider,
        AccessTokenGuard,
        CookieCsrfGuard,
    ],
    exports: [
        AccessTokenProvider,
        UsersService,
        SessionsService,
        AccessTokenGuard,
        AuthCookieProvider,
    ],
})
export class UsersModule implements NestModule {
    constructor(private readonly redis: RedisService) {}
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(
                createAuthRateLimit(
                    10,
                    this.redis.createRateLimitStore("credentials"),
                ),
            )
            .forRoutes(
                {
                    path: "users/register",
                    method: RequestMethod.POST,
                    version: "1",
                },
                {
                    path: "users/login",
                    method: RequestMethod.POST,
                    version: "1",
                },
            );
        consumer
            .apply(
                createAuthRateLimit(30, this.redis.createRateLimitStore("otp")),
            )
            .forRoutes(
                {
                    path: "auth/otp/verify",
                    method: RequestMethod.POST,
                    version: "1",
                },
                {
                    path: "auth/otp/resend",
                    method: RequestMethod.POST,
                    version: "1",
                },
            );
        consumer
            .apply(
                createAuthRateLimit(
                    60,
                    this.redis.createRateLimitStore("sessions"),
                ),
            )
            .forRoutes(
                {
                    path: "auth/refresh",
                    method: RequestMethod.POST,
                    version: "1",
                },
                {
                    path: "auth/logout",
                    method: RequestMethod.POST,
                    version: "1",
                },
            );
    }
}
