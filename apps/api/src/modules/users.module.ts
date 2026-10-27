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

@Module({
    imports: [PrismaModule],
    controllers: [UsersController, AuthController],
    providers: [
        UsersService,
        SessionsService,
        PasswordProvider,
        AccessTokenProvider,
        AuthCookieProvider,
        AccessTokenGuard,
        CookieCsrfGuard,
    ],
    exports: [
        UsersService,
        SessionsService,
        AccessTokenGuard,
        AuthCookieProvider,
    ],
})
export class UsersModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(createAuthRateLimit())
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
            .apply(createAuthRateLimit(60))
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
