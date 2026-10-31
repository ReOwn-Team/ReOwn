import {
    extendZodWithOpenApi,
    OpenAPIRegistry,
    OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { OpenAPIObject } from "@nestjs/swagger";
import {
    loginUserSchema,
    registerUserSchema,
    updateUserSchema,
} from "../dtos/user.dto";
import type { AuthResponse, UserProfile } from "../models/user.model";
import { ACCESS_TOKEN_TTL_SECONDS } from "../providers/access-token.provider";

extendZodWithOpenApi(z);
const registry = new OpenAPIRegistry();

registry.register(
    "RegisterUserRequest",
    registerUserSchema.describe(
        "Name and email are trimmed before validation; email is lowercased. Phone uses E.164. Password is never trimmed.",
    ),
);
registry.register(
    "LoginUserRequest",
    loginUserSchema.describe(
        "Send exactly one identifier form: identifier (email or E.164 phone), legacy email, or phone, together with password. Email is trimmed/lowercased.",
    ),
);
registry.register(
    "UpdateUserRequest",
    updateUserSchema.describe(
        "Only displayName can be updated; it is trimmed before validation.",
    ),
);

export const userProfileSchema = registry.register(
    "UserProfile",
    z
        .object({
            id: z.string().uuid(),
            displayName: z.string(),
            avatarKey: z.string().nullable(),
            email: z.string(),
            phone: z.string(),
            emailVerified: z.number().int(),
            phoneVerified: z.number().int(),
            kycStatus: z.number().int(),
            role: z.string(),
            status: z.string(),
        })
        .strict() satisfies z.ZodType<UserProfile>,
);

export const authResponseSchema = registry.register(
    "AuthResponse",
    z
        .object({
            user: userProfileSchema,
            accessToken: z.string(),
            tokenType: z.literal("Bearer"),
            expiresIn: z.literal(ACCESS_TOKEN_TTL_SECONDS),
        })
        .strict() satisfies z.ZodType<AuthResponse>,
);

export const validationErrorSchema = registry.register(
    "ValidationError",
    z
        .object({
            message: z.literal("Validation failed"),
            errors: z.array(
                z.object({ field: z.string(), message: z.string() }).strict(),
            ),
        })
        .strict(),
);

export const httpErrorSchema = registry.register(
    "HttpError",
    z
        .object({
            statusCode: z.number().int(),
            message: z.string(),
            error: z.string().optional(),
        })
        .strict(),
);

export const healthResponseSchema = registry.register(
    "HealthResponse",
    z
        .object({
            status: z.literal("ok"),
        })
        .strict(),
);

export type ContractSchemaName =
    | "RegisterUserRequest"
    | "LoginUserRequest"
    | "UpdateUserRequest"
    | "UserProfile"
    | "AuthResponse"
    | "ValidationError"
    | "HttpError"
    | "HealthResponse";

export function createContractSchemas() {
    const schemas =
        new OpenApiGeneratorV3(registry.definitions).generateComponents()
            .components?.schemas ?? {};
    // V3 emits scalar OAS 3.0 types; openapi3-ts also permits type arrays that Nest's types exclude.
    return schemas as NonNullable<
        NonNullable<OpenAPIObject["components"]>["schemas"]
    >;
}
