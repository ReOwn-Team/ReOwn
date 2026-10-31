import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createContractSchemas } from "./schemas";

export function createOpenApiDocument(app: INestApplication) {
    const config = new DocumentBuilder()
        .setTitle("ReOwn API")
        .setDescription("Personal account API v1. Access tokens are Bearer JWTs; refresh tokens are HttpOnly cookies. Cookie mutations require the exact configured Origin plus X-ReOwn-Client: web. Use credentials: include in browser requests.")
        .setVersion("1.0.0")
        .addServer("/")
        .addTag("users", "Registration, email/phone-password login and private profile")
        .addTag("auth", "Refresh rotation and per-login session-family logout")
        .addTag("health", "Service liveness")
        .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT", description: "15-minute access token bound to an active session family." }, "accessToken")
        .addCookieAuth("__Secure-reown_refresh", { type: "apiKey", in: "cookie", description: "Production/default Secure HttpOnly refresh cookie; browser managed." }, "refreshCookie")
        .addCookieAuth("reown_refresh", { type: "apiKey", in: "cookie", description: "Only for explicit COOKIE_SECURE=false on localhost development." }, "developmentRefreshCookie")
        .build();
    const document = SwaggerModule.createDocument(app, config);
    document.components = {
        ...document.components,
        schemas: { ...document.components?.schemas, ...createContractSchemas() },
    };
    return document;
}

export function setupOpenApi(app: INestApplication): void {
    SwaggerModule.setup("docs", app, () => createOpenApiDocument(app), {
        jsonDocumentUrl: "docs/openapi.json",
        yamlDocumentUrl: "docs/openapi.yaml",
        swaggerOptions: { persistAuthorization: false, withCredentials: true },
    });
}
