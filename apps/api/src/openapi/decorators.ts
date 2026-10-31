import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiResponse, ApiSecurity } from "@nestjs/swagger";
import type { ContractSchemaName } from "./schemas";

export const schemaRef = (name: ContractSchemaName) => ({ $ref: `#/components/schemas/${name}` });

export function ApiRequestBody(name: ContractSchemaName) {
    return ApiBody({ required: true, schema: schemaRef(name) });
}

const errorDescriptions: Record<number, string> = {
    400: "Invalid JSON or request validation failed; unknown fields are rejected.",
    401: "Invalid credentials, missing/expired token, inactive user, or expired/revoked session. Login failures do not identify which credential failed.",
    403: "CSRF policy rejected the Origin or X-ReOwn-Client header; this is not a login failure.",
    409: "An account with these details already exists; the conflicting field is not disclosed.",
    429: "Rate limit exceeded. Observe Retry-After before retrying.",
    500: "Unexpected server or database error.",
};

export function ApiErrors(...statuses: number[]) {
    return applyDecorators(...statuses.map((status) => ApiResponse({
        status,
        description: errorDescriptions[status],
        schema: status === 400
            ? { anyOf: [schemaRef("ValidationError"), schemaRef("HttpError")] }
            : schemaRef("HttpError"),
        ...(status === 429 ? { headers: { "Retry-After": { description: "Seconds before retrying", schema: { type: "string" } } } } : {}),
    })));
}

export function ApiCsrfHeaders() {
    return applyDecorators(
        ApiHeader({
            name: "Origin",
            required: true,
            description: "Must exactly equal CLIENT_ORIGIN. Browsers set this header automatically; do not override it from frontend JavaScript.",
            schema: { type: "string", format: "uri" },
        }),
        ApiHeader({
            name: "X-ReOwn-Client",
            required: true,
            description: "CSRF protection: send together with credentials: include and the configured Origin.",
            schema: { type: "string", enum: ["web"] },
        }),
    );
}

export function ApiAuthSuccess(status: 200 | 201) {
    return ApiResponse({
        status,
        description: "Access token and private profile. Refresh token is ONLY in Set-Cookie, never in JSON. Store the access token in memory, not localStorage.",
        schema: schemaRef("AuthResponse"),
        headers: {
            "Cache-Control": { schema: { type: "string", enum: ["no-store"] } },
            "Set-Cookie": {
                description: "Rotating HttpOnly refresh cookie, host-only, Path=/api/v1/auth, SameSite=Lax by default, Secure by default. Local insecure development uses reown_refresh instead of __Secure-reown_refresh.",
                schema: { type: "string" },
            },
        },
    });
}

export function ApiRefreshCookie() {
    // Separate security requirement objects mean either configured cookie name is accepted.
    return applyDecorators(ApiSecurity("refreshCookie"), ApiSecurity("developmentRefreshCookie"));
}

export function ApiProfileSuccess() {
    return ApiResponse({
        status: 200,
        description: "The authenticated user's private profile; never contains password or token hashes.",
        schema: schemaRef("UserProfile"),
        headers: { "Cache-Control": { schema: { type: "string", enum: ["no-store"] } } },
    });
}
