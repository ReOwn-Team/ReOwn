import {
    Controller,
    Get,
    Header,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { z } from "zod";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { UserProfile } from "../models/user.model";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { AdminGuard } from "../inspection/admin.guard";
import { ApiErrors, schemaRef } from "../openapi/decorators";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AdminService } from "../services/admin.service";

const userSchema = {
    type: "object" as const,
    required: [
        "id",
        "displayName",
        "email",
        "phone",
        "emailVerified",
        "phoneVerified",
        "kycStatus",
        "role",
        "status",
    ],
    properties: {
        id: { type: "string" as const, format: "uuid" },
        displayName: { type: "string" as const },
        email: { type: "string" as const },
        phone: { type: "string" as const },
        emailVerified: { type: "integer" as const },
        phoneVerified: { type: "integer" as const },
        kycStatus: { type: "integer" as const },
        role: { type: "string" as const },
        status: { type: "string" as const },
    },
};
const kycHistorySchema = {
    type: "object" as const,
    required: ["id", "status", "createdAt", "reviewedAt", "purgedAt"],
    properties: {
        id: { type: "string" as const, format: "uuid" },
        status: { type: "string" as const },
        createdAt: { type: "string" as const, format: "date-time" },
        reviewedAt: {
            type: "string" as const,
            format: "date-time",
            nullable: true,
        },
        purgedAt: {
            type: "string" as const,
            format: "date-time",
            nullable: true,
        },
    },
};
export const adminSearchSchema = z.string().trim().min(1).max(100).optional();
export const adminLimitSchema = z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .transform((value) => value ?? 25);

@ApiTags("admin")
@ApiBearerAuth("accessToken")
@UseGuards(AccessTokenGuard, AdminGuard)
@Controller({ path: "admin", version: "1" })
export class AdminController {
    constructor(private readonly admin: AdminService) {}

    @Get("statistics")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "adminStatistics",
        summary: "Aggregate dashboard counts",
        description:
            "Counts all users, active users, non-deleted products, publicly visible published products, all orders and all reports. Counts may reflect concurrent changes.",
    })
    @ApiResponse({
        status: 200,
        schema: {
            type: "object",
            required: [
                "users",
                "activeUsers",
                "products",
                "publishedProducts",
                "orders",
                "reports",
            ],
            properties: {
                users: { type: "integer" },
                activeUsers: { type: "integer" },
                products: { type: "integer" },
                publishedProducts: { type: "integer" },
                orders: { type: "integer" },
                reports: { type: "integer" },
            },
        },
    })
    @ApiErrors(401, 500)
    @ApiResponse({
        status: 403,
        description: "Administrator role required",
        schema: schemaRef("HttpError"),
    })
    statistics() {
        return this.admin.statistics();
    }

    @Get("users")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "adminUsersList",
        summary: "Search and list users (personal data access is audited)",
        description:
            "Case-insensitive literal substring search across display name, email and phone. UUID keyset pagination is not a snapshot; repeat the same search on subsequent pages.",
    })
    @ApiQuery({
        name: "limit",
        required: false,
        type: Number,
        minimum: 1,
        maximum: 100,
        example: 25,
    })
    @ApiQuery({
        name: "cursor",
        required: false,
        type: String,
        format: "uuid",
        description: "Last user ID from the preceding page",
    })
    @ApiQuery({
        name: "search",
        required: false,
        type: String,
        minLength: 1,
        maxLength: 100,
        description: "Trimmed literal substring; do not log query strings",
    })
    @ApiResponse({
        status: 200,
        schema: {
            type: "object",
            required: ["items", "nextCursor"],
            properties: {
                items: { type: "array", items: userSchema },
                nextCursor: { type: "string", format: "uuid", nullable: true },
            },
        },
    })
    @ApiErrors(400, 401, 500)
    @ApiResponse({
        status: 403,
        description: "Administrator role required",
        schema: schemaRef("HttpError"),
    })
    users(
        @CurrentUser() admin: UserProfile,
        @Query("limit", new ZodValidationPipe(adminLimitSchema)) limit: number,
        @Query("cursor", new ZodValidationPipe(z.string().uuid().optional()))
        cursor?: string,
        @Query("search", new ZodValidationPipe(adminSearchSchema))
        search?: string,
    ) {
        return this.admin.users(admin.id, limit, cursor, search);
    }

    @Get("users/:id")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "adminUserGet",
        summary: "Get user details and retained KYC history metadata (audited)",
        description:
            "Returns at most 50 existing KYC records, newest first. Purged or deleted records cannot be recovered.",
    })
    @ApiResponse({
        status: 200,
        schema: {
            type: "object",
            required: [
                ...userSchema.required,
                "kycHistory",
                "kycHistoryTruncated",
            ],
            properties: {
                ...userSchema.properties,
                kycHistory: { type: "array", items: kycHistorySchema },
                kycHistoryTruncated: { type: "boolean" },
            },
        },
    })
    @ApiErrors(400, 401, 404, 500)
    @ApiResponse({
        status: 403,
        description: "Administrator role required",
        schema: schemaRef("HttpError"),
    })
    user(
        @CurrentUser() admin: UserProfile,
        @Param("id", ParseUUIDPipe) id: string,
    ) {
        return this.admin.user(admin.id, id);
    }
}
