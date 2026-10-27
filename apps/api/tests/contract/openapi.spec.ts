import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
    OpenAPIObject,
    OperationObject,
    ReferenceObject,
    SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import type { components, operations } from "../../../../shared/api/schema";
import { AppModule } from "../../src/app.module";
import { configureHttp } from "../../src/config/http.config";
import {
    loginUserSchema,
    registerUserSchema,
    updateUserSchema,
} from "../../src/dtos/user.dto";
import { userProfileSelect, type UserProfile } from "../../src/models/user.model";
import { createOpenApiDocument, setupOpenApi } from "../../src/openapi/document";
import {
    authResponseSchema,
    createContractSchemas,
    healthResponseSchema,
    httpErrorSchema,
    userProfileSchema,
    validationErrorSchema,
} from "../../src/openapi/schemas";
import { PrismaService } from "../../src/prisma/prisma.service";
import { AccessTokenProvider } from "../../src/providers/access-token.provider";

const routes = [
    ["get", "/api/v1/health", "healthCheck", [200]],
    ["post", "/api/v1/users/register", "usersRegister", [201, 400, 403, 409, 429, 500]],
    ["post", "/api/v1/users/login", "usersLogin", [200, 400, 401, 403, 429, 500]],
    ["get", "/api/v1/users/me", "usersGetMe", [200, 401, 500]],
    ["patch", "/api/v1/users/me", "usersUpdateMe", [200, 400, 401, 500]],
    ["post", "/api/v1/auth/refresh", "authRefresh", [200, 401, 403, 429, 500]],
    ["post", "/api/v1/auth/logout", "authLogout", [204, 403, 429, 500]],
] as const;
const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const clientOrigin = "http://localhost:5173";
const csrfHeaders = { Origin: clientOrigin, "X-ReOwn-Client": "web" };

type RegisterRequest = operations["usersRegister"]["requestBody"]["content"]["application/json"];
type LoginRequest = operations["usersLogin"]["requestBody"]["content"]["application/json"];
type UpdateRequest = operations["usersUpdateMe"]["requestBody"]["content"]["application/json"];
type AuthBody = operations["usersLogin"]["responses"][200]["content"]["application/json"];

const profile = {
    id: "f47221b7-a23b-44bb-9c42-cfc153728910",
    displayName: "Alice",
    avatarKey: null,
    email: "alice@example.com",
    phone: "+84901234567",
    emailVerified: 0,
    phoneVerified: 0,
    kycStatus: 0,
    role: "user",
    status: "active",
} satisfies UserProfile & components["schemas"]["UserProfile"];
const registration = {
    displayName: profile.displayName,
    email: profile.email,
    phone: profile.phone,
    password: "a secure password",
} satisfies RegisterRequest;
const authBody = {
    user: profile,
    accessToken: "public-access-token",
    tokenType: "Bearer",
    expiresIn: 900,
} satisfies AuthBody;

function inlineSchema(value: SchemaObject | ReferenceObject | undefined): SchemaObject {
    if (!value || "$ref" in value) {
        throw new Error(`Expected an inline schema, received ${JSON.stringify(value)}`);
    }
    return value;
}

function walk(value: unknown, visit: (node: Record<string, unknown>, path: string) => void, path = "#"): void {
    if (Array.isArray(value)) {
        value.forEach((child, index) => walk(child, visit, `${path}/${index}`));
    } else if (value !== null && typeof value === "object") {
        visit(value as Record<string, unknown>, path);
        for (const [key, child] of Object.entries(value)) {
            walk(child, visit, `${path}/${key}`);
        }
    }
}

// Match the wire/artifact representation, omitting Nest's undefined metadata.
function serialized<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

describe("OpenAPI contract", () => {
    const envKeys = ["NODE_ENV", "CLIENT_ORIGIN", "COOKIE_SECURE", "COOKIE_SAMESITE"] as const;
    let previousEnv: Record<string, string | undefined>;
    let app: INestApplication | undefined;
    let baseUrl: string;
    let document: OpenAPIObject;
    let artifact: OpenAPIObject;

    beforeAll(async () => {
        previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
        Object.assign(process.env, {
            NODE_ENV: "test",
            CLIENT_ORIGIN: clientOrigin,
            COOKIE_SECURE: "true",
            COOKIE_SAMESITE: "lax",
        });
        artifact = JSON.parse(readFileSync(resolve(__dirname, "../../openapi.json"), "utf8")) as OpenAPIObject;
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(PrismaService).useValue({})
            .overrideProvider(AccessTokenProvider).useValue({})
            .compile();
        app = module.createNestApplication({ logger: false });
        configureHttp(app);
        // Exercise the offline path before initialization, without dist, a DB, or JWT secrets.
        document = createOpenApiDocument(app);
        setupOpenApi(app);
        await app.listen(0, "127.0.0.1");
        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    }, 15000);

    afterAll(async () => {
        try {
            await app?.close();
        } finally {
            for (const key of envKeys) {
                if (previousEnv[key] === undefined) delete process.env[key];
                else process.env[key] = previousEnv[key];
            }
        }
    }, 15000);

    function operation(id: string): OperationObject {
        for (const item of Object.values(document.paths)) {
            for (const method of methods) {
                const candidate = item[method];
                if (candidate?.operationId === id) return candidate;
            }
        }
        throw new Error(`Missing operation ${id}`);
    }

    function schema(name: string): SchemaObject {
        return inlineSchema(document.components?.schemas?.[name]);
    }

    function response(id: string, status: number) {
        const value = operation(id).responses[String(status)];
        if (!value || "$ref" in value) throw new Error(`Missing inline response ${id}: ${status}`);
        return value;
    }

    async function request(path: string, options: RequestInit = {}) {
        return fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
    }

    it("matches the checked-in artifact semantically and uses the exported Zod registry", () => {
        expect(serialized(document)).toEqual(artifact);
        expect(serialized(document.components?.schemas)).toEqual(serialized(createContractSchemas()));
        expect(Object.keys(document.components?.schemas ?? {}).sort()).toEqual([
            "AuthResponse", "HealthResponse", "HttpError", "LoginUserRequest",
            "RegisterUserRequest", "UpdateUserRequest", "UserProfile", "ValidationError",
        ]);
    });

    it("exposes exactly seven versioned operations with unique, stable operationIds", () => {
        const actual = Object.entries(document.paths).flatMap(([path, item]) =>
            methods.flatMap((method) => item[method] ? [`${method} ${path} ${item[method]?.operationId}`] : []),
        );
        expect(actual.sort()).toEqual(routes.map(([method, path, id]) => `${method} ${path} ${id}`).sort());
        expect(new Set(routes.map(([, , id]) => operation(id).operationId)).size).toBe(7);
    });

    it.each([
        ["usersRegister", "RegisterUserRequest"],
        ["usersLogin", "LoginUserRequest"],
        ["usersUpdateMe", "UpdateUserRequest"],
    ])("%s references the required %s body", (id, name) => {
        const body = operation(id).requestBody;
        if (!body || "$ref" in body) throw new Error(`Missing inline request body for ${id}`);
        expect(body.required).toBe(true);
        expect(body.content["application/json"].schema).toEqual(ref(name));
    });

    it("keeps registration and update inputs strict and registration password bounds authoritative", () => {
        const register = schema("RegisterUserRequest");
        expect(register.additionalProperties).toBe(false);
        expect(Object.keys(register.properties ?? {}).sort()).toEqual(Object.keys(registration).sort());
        expect(register.required?.slice().sort()).toEqual(Object.keys(registration).sort());
        expect(register.properties?.password).toEqual({ type: "string", minLength: 12, maxLength: 128 });
        for (const [length, valid] of [[11, false], [12, true], [128, true], [129, false]] as const) {
            expect(registerUserSchema.safeParse({ ...registration, password: "p".repeat(length) }).success).toBe(valid);
        }
        expect(registerUserSchema.safeParse({ ...registration, role: "admin" }).success).toBe(false);
        expect(schema("UpdateUserRequest")).toMatchObject({
            type: "object", additionalProperties: false, required: ["displayName"],
        });
        expect(Object.keys(schema("UpdateUserRequest").properties ?? {})).toEqual(["displayName"]);
    });

    it("describes exactly three strict login forms, with email/phone canonical identifiers", () => {
        const variants = schema("LoginUserRequest").anyOf?.map(inlineSchema);
        expect(variants).toHaveLength(3);
        for (const [index, identifier] of ["identifier", "email", "phone"].entries()) {
            const variant = variants![index];
            expect(variant.additionalProperties).toBe(false);
            expect(Object.keys(variant.properties ?? {}).sort()).toEqual([identifier, "password"].sort());
            expect(variant.required?.slice().sort()).toEqual([identifier, "password"].sort());
            expect(variant.properties?.password).toEqual({ type: "string", minLength: 1, maxLength: 128 });
        }
        expect(inlineSchema(variants![0].properties?.identifier).anyOf).toEqual([
            { type: "string", format: "email", maxLength: 254 },
            { type: "string", pattern: "^\\+[1-9]\\d{7,14}$" },
        ]);
        expect(variants![1].properties?.email).toEqual({ type: "string", format: "email", maxLength: 254 });
        expect(variants![2].properties?.phone).toEqual({ type: "string", pattern: "^\\+[1-9]\\d{7,14}$" });
        const logins: LoginRequest[] = [
            { identifier: profile.email, password: "p" },
            { identifier: profile.phone, password: "p" },
            { email: profile.email, password: "p" },
            { phone: profile.phone, password: "p" },
        ];
        logins.forEach((login) => expect(loginUserSchema.safeParse(login).success).toBe(true));
        expect(loginUserSchema.safeParse({ ...logins[0], email: profile.email }).success).toBe(false);
        expect(loginUserSchema.safeParse({ ...logins[2], phone: profile.phone }).success).toBe(false);
    });

    it("limits public profile and auth response properties to their declared safe models", () => {
        const selected = Object.keys(userProfileSelect).sort();
        expect(Object.keys(schema("UserProfile").properties ?? {}).sort()).toEqual(selected);
        expect(schema("UserProfile").required?.slice().sort()).toEqual(selected);
        expect(schema("UserProfile").additionalProperties).toBe(false);
        const auth = schema("AuthResponse");
        expect(auth.additionalProperties).toBe(false);
        expect(Object.keys(auth.properties ?? {}).sort()).toEqual(["accessToken", "expiresIn", "tokenType", "user"]);
        expect(auth.required?.slice().sort()).toEqual(["accessToken", "expiresIn", "tokenType", "user"]);
        expect(auth.properties?.user).toEqual(ref("UserProfile"));
        expect(auth.properties?.expiresIn).toEqual({ type: "number", enum: [900] });
        expect(auth.properties?.tokenType).toEqual({ type: "string", enum: ["Bearer"] });
        expect(userProfileSchema.parse(profile)).toEqual(profile);
        expect(authResponseSchema.parse(authBody)).toEqual(authBody);
    });

    it.each(["password", "passwordHash", "refreshToken", "refreshTokenHash", "tokenHash", "createdAt", "undeclared"])(
        "rejects undeclared %s fields rather than silently stripping leaked model data",
        (field) => {
            const unsafeProfile = { ...profile, [field]: "private" };
            expect(userProfileSchema.safeParse(unsafeProfile).success).toBe(false);
            expect(authResponseSchema.safeParse({ ...authBody, [field]: "private" }).success).toBe(false);
            expect(authResponseSchema.safeParse({ ...authBody, user: unsafeProfile }).success).toBe(false);
        },
    );

    it("keeps generated request and response types usable, narrow, and aligned with Zod", () => {
        const update: UpdateRequest = { displayName: "Updated name" };
        expect(updateUserSchema.parse(update)).toEqual(update);
        const unsafeUpdate: UpdateRequest = {
            displayName: "Updated name",
            // @ts-expect-error Generated update inputs must not expose privileged fields.
            role: "admin",
        };
        // @ts-expect-error Generated auth responses preserve the literal token type.
        const invalidTokenType: AuthBody["tokenType"] = "bearer";
        // @ts-expect-error Generated auth responses preserve the 15-minute TTL literal.
        const invalidExpiry: AuthBody["expiresIn"] = 3600;
        expect(updateUserSchema.safeParse(unsafeUpdate).success).toBe(false);
        expect(authResponseSchema.safeParse({ ...authBody, tokenType: invalidTokenType }).success).toBe(false);
        expect(authResponseSchema.safeParse({ ...authBody, expiresIn: invalidExpiry }).success).toBe(false);
    });

    it("requires CSRF headers on all four cookie-mutating POSTs, but not bearer-only profile requests", () => {
        for (const [, , id] of routes) {
            const parameters = operation(id).parameters ?? [];
            const headers = parameters.filter((parameter) => !("$ref" in parameter) && parameter.in === "header");
            if (["usersRegister", "usersLogin", "authRefresh", "authLogout"].includes(id)) {
                expect(headers).toEqual(expect.arrayContaining([
                    expect.objectContaining({ in: "header", name: "Origin", required: true, schema: { type: "string", format: "uri" } }),
                    expect.objectContaining({ in: "header", name: "X-ReOwn-Client", required: true, schema: { type: "string", enum: ["web"] } }),
                ]));
                expect(headers).toHaveLength(2);
            } else {
                expect(headers).toEqual([]);
            }
        }
    });

    it("uses bearer only for /me, cookie alternatives for refresh, and optional cookies for logout", () => {
        expect(document.security ?? []).toEqual([]);
        expect(document.components?.securitySchemes).toMatchObject({
            accessToken: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            refreshCookie: { type: "apiKey", in: "cookie", name: "__Secure-reown_refresh" },
            developmentRefreshCookie: { type: "apiKey", in: "cookie", name: "reown_refresh" },
        });
        for (const id of ["healthCheck", "usersRegister", "usersLogin"]) {
            expect(operation(id).security ?? []).toEqual([]);
        }
        for (const id of ["usersGetMe", "usersUpdateMe"]) {
            expect(operation(id).security).toEqual([{ accessToken: [] }]);
        }
        expect(operation("authRefresh").security).toHaveLength(2);
        expect(operation("authRefresh").security).toEqual(expect.arrayContaining([
            { refreshCookie: [] }, { developmentRefreshCookie: [] },
        ]));
        expect(operation("authLogout").security).toHaveLength(3);
        expect(operation("authLogout").security).toEqual(expect.arrayContaining([
            {}, { refreshCookie: [] }, { developmentRefreshCookie: [] },
        ]));
        for (const id of ["healthCheck", "usersGetMe", "authRefresh", "authLogout"]) {
            expect(operation(id).requestBody).toBeUndefined();
        }
    });

    it.each(routes)("%s %s (%s) documents its success and important failure codes", (_method, _path, id, statuses) => {
        expect(Object.keys(operation(id).responses).sort()).toEqual(statuses.map(String).sort());
        for (const status of statuses) {
            const result = response(id, status);
            if (status >= 400) {
                expect(result.content?.["application/json"].schema).toEqual(status === 400
                    ? { anyOf: [ref("ValidationError"), ref("HttpError")] }
                    : ref("HttpError"));
            }
            if (status === 429) {
                expect(result.headers?.["Retry-After"]).toMatchObject({ schema: { type: "string" } });
            }
        }
    });

    it("references safe success schemas and documents cookie/cache headers without a 204 body", () => {
        for (const [id, status, name] of [
            ["healthCheck", 200, "HealthResponse"],
            ["usersRegister", 201, "AuthResponse"],
            ["usersLogin", 200, "AuthResponse"],
            ["usersGetMe", 200, "UserProfile"],
            ["usersUpdateMe", 200, "UserProfile"],
            ["authRefresh", 200, "AuthResponse"],
        ] as const) {
            const result = response(id, status);
            expect(result.content?.["application/json"].schema).toEqual(ref(name));
            if (id !== "healthCheck") {
                expect(result.headers?.["Cache-Control"]).toEqual({ schema: { type: "string", enum: ["no-store"] } });
            }
            if (name === "AuthResponse") {
                expect(result.headers?.["Set-Cookie"]).toMatchObject({ schema: { type: "string" } });
            }
        }
        const logout = response("authLogout", 204);
        expect(logout.content).toBeUndefined();
        expect(logout).not.toHaveProperty("schema");
        expect(logout.headers?.["Set-Cookie"]).toMatchObject({ schema: { type: "string" } });
        expect(logout.headers?.["Cache-Control"]).toEqual({ schema: { type: "string", enum: ["no-store"] } });
    });

    it("resolves every local JSON pointer and emits scalar OpenAPI 3.0 schema types", () => {
        expect(document.openapi).toMatch(/^3\.0\.\d+$/);
        let references = 0;
        walk(document, (node, path) => {
            if (!("$ref" in node)) return;
            references++;
            const pointer = node.$ref;
            expect({ path, pointer }).toEqual({ path, pointer: expect.stringMatching(/^#\//) });
            if (typeof pointer !== "string" || !pointer.startsWith("#/")) throw new Error(`Invalid $ref at ${path}`);
            let target: unknown = document;
            for (const token of pointer.slice(2).split("/")) {
                const key = decodeURIComponent(token).replace(/~1/g, "/").replace(/~0/g, "~");
                if (target === null || typeof target !== "object" || !Object.hasOwn(target, key)) {
                    throw new Error(`Unresolved $ref ${pointer} at ${path}`);
                }
                target = (target as Record<string, unknown>)[key];
            }
            expect(target).toBeDefined();
        });
        expect(references).toBeGreaterThan(0);
        walk(document.components?.schemas, (node, path) => {
            if ("type" in node) {
                expect({ path, type: node.type }).toEqual({
                    path, type: expect.stringMatching(/^(string|number|integer|boolean|object|array)$/),
                });
            }
            expect(node).not.toHaveProperty("const");
        });
        expect(schema("UserProfile").properties?.avatarKey).toEqual({ type: "string", nullable: true });
    });

    it("serves the same checked-in contract from the runtime Swagger JSON endpoint", async () => {
        const result = await request("/docs/openapi.json");
        expect(result.status).toBe(200);
        expect(result.headers.get("content-type")).toContain("application/json");
        expect(await result.json()).toEqual(artifact);
    }, 10000);

    it("validates the actual health response against the exported response schema", async () => {
        const result = await request("/api/v1/health");
        expect(result.status).toBe(200);
        expect(healthResponseSchema.parse(await result.json())).toEqual({ status: "ok" });
    }, 10000);

    it("validates a real CSRF 403 without touching the database or JWT provider", async () => {
        const result = await request("/api/v1/users/login", { method: "POST" });
        expect(result.status).toBe(403);
        const body = await result.json();
        expect(httpErrorSchema.parse(body)).toEqual(body);
        expect(body).toMatchObject({ statusCode: 403 });
    }, 10000);

    it("validates a real strict-body 400 against the validation-error contract", async () => {
        const result = await request("/api/v1/users/register", {
            method: "POST",
            headers: { ...csrfHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ ...registration, role: "admin" }),
        });
        expect(result.status).toBe(400);
        const body = await result.json();
        expect(validationErrorSchema.parse(body)).toEqual(body);
        expect(body).toMatchObject({ message: "Validation failed", errors: expect.any(Array) });
    }, 10000);

    it("validates malformed JSON's alternative 400 HttpError contract", async () => {
        const result = await request("/api/v1/users/register", {
            method: "POST",
            headers: { ...csrfHeaders, "Content-Type": "application/json" },
            body: "{",
        });
        expect(result.status).toBe(400);
        const body = await result.json();
        expect(httpErrorSchema.parse(body)).toEqual(body);
        expect(body).toMatchObject({ statusCode: 400 });
    }, 10000);
});
