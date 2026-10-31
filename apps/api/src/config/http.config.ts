import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AuthCookieProvider } from "../providers/auth-cookie.provider";

export function configureHttp(app: INestApplication): void {
    const cookies = app.get(AuthCookieProvider);
    app.use(cookieParser());
    app.enableCors({
        origin: cookies.clientOrigin,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-ReOwn-Client"],
    });
    app.enableVersioning({
        type: VersioningType.URI,
        prefix: "api/v",
        defaultVersion: "1",
    });
}
