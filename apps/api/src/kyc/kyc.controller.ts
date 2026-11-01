import type {} from "multer";
import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Res,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../decorators/current-user.decorator";
import { kycConsentSchema, kycDecisionSchema } from "../dtos/kyc.dto";
import type { KycDecision } from "../dtos/kyc.dto";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { AdminGuard } from "../inspection/admin.guard";
import type { UserProfile } from "../models/user.model";
import { ApiErrors } from "../openapi/decorators";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { KycService } from "./kyc.service";

const uploads = FileFieldsInterceptor(
    [
        { name: "card_front", maxCount: 1 },
        { name: "selfie", maxCount: 1 },
    ],
    {
        limits: {
            fileSize: 6 * 1024 * 1024,
            files: 2,
            fields: 2,
            fieldSize: 256,
            parts: 4,
        },
    },
);

const submissionBody = {
    required: true,
    schema: {
        type: "object" as const,
        required: ["card_front", "selfie", "consent"],
        properties: {
            card_front: {
                type: "string" as const,
                format: "binary",
                description: "Front of the student card (JPEG, PNG or WebP)",
            },
            selfie: {
                type: "string" as const,
                format: "binary",
                description: "Live selfie (JPEG, PNG or WebP)",
            },
            consent: {
                type: "string" as const,
                description: "Consent version the user accepted",
            },
        },
    },
};

@ApiTags("kyc")
@ApiBearerAuth("accessToken")
@UseGuards(AccessTokenGuard)
@Controller({ path: "kyc", version: "1" })
export class KycController {
    constructor(private readonly kyc: KycService) {}

    @Get("me")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "kycStatus",
        summary: "Read your student-card verification status",
    })
    @ApiResponse({ status: 200, description: "Status only; no personal data" })
    @ApiErrors(401, 500)
    status(@CurrentUser() user: UserProfile) {
        return this.kyc.status(user.id);
    }

    @Post("submissions")
    @Header("Cache-Control", "no-store")
    @UseInterceptors(uploads)
    @ApiOperation({
        operationId: "kycSubmit",
        summary: "Submit a student card front and selfie for verification",
    })
    @ApiConsumes("multipart/form-data")
    @ApiBody(submissionBody)
    @ApiResponse({
        status: 201,
        description: "Accepted for admin review",
    })
    @ApiErrors(400, 401, 409, 413, 422, 429, 500, 503)
    submit(
        @CurrentUser() user: UserProfile,
        @UploadedFiles()
        files: {
            card_front?: Express.Multer.File[];
            selfie?: Express.Multer.File[];
        },
        @Body("consent") consent: unknown,
    ) {
        if (!kycConsentSchema.safeParse(consent).success)
            throw new BadRequestException("Consent is required");
        return this.kyc.submit(user, {
            front: files?.card_front?.[0]?.buffer,
            selfie: files?.selfie?.[0]?.buffer,
        });
    }

    @Delete("me")
    @HttpCode(204)
    @ApiOperation({
        operationId: "kycWithdraw",
        summary: "Withdraw verification and erase stored images and data",
    })
    @ApiResponse({ status: 204, description: "Stored KYC data erased" })
    @ApiErrors(401, 500)
    withdraw(@CurrentUser() user: UserProfile) {
        return this.kyc.withdraw(user.id);
    }
}

@ApiTags("kyc-admin")
@ApiBearerAuth("accessToken")
@UseGuards(AccessTokenGuard, AdminGuard)
@Controller({ path: "admin/kyc", version: "1" })
export class KycAdminController {
    constructor(private readonly kyc: KycService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "kycReviewList",
        summary: "Admin: list up to 50 submissions awaiting review",
    })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiResponse({ status: 200, description: "Pending submissions" })
    @ApiErrors(401, 403, 500)
    list(
        @Query("cursor", new ZodValidationPipe(z.string().uuid().optional()))
        cursor?: string,
    ) {
        return this.kyc.list(cursor);
    }

    @Get(":id")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "kycReviewDetail",
        summary: "Admin: extracted fields and automated observations",
    })
    @ApiResponse({ status: 200, description: "Decrypted for this request only" })
    @ApiErrors(400, 401, 403, 404, 500)
    detail(
        @Param("id", ParseUUIDPipe) id: string,
        @CurrentUser() admin: UserProfile,
    ) {
        return this.kyc.detail(id, admin.id);
    }

    @Get(":id/assets/:kind")
    @ApiOperation({
        operationId: "kycReviewAsset",
        summary: "Admin: stream one decrypted image (every view is audited)",
    })
    @ApiResponse({
        status: 200,
        content: {
            "image/webp": { schema: { type: "string", format: "binary" } },
        },
    })
    @ApiErrors(400, 401, 403, 404, 500)
    async asset(
        @Param("id", ParseUUIDPipe) id: string,
        @Param("kind") kind: string,
        @CurrentUser() admin: UserProfile,
        @Res() response: Response,
    ) {
        const bytes = await this.kyc.asset(id, kind, admin.id);
        response.setHeader("Content-Type", "image/webp");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "default-src 'none'");
        response.send(bytes);
    }

    @Post(":id/decision")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "kycReviewDecision",
        summary: "Admin: approve or reject; images and data are erased",
    })
    @ApiBody({
        required: true,
        schema: {
            type: "object",
            required: ["decision"],
            properties: {
                decision: { type: "string", enum: ["approve", "reject"] },
                reason: { type: "string", maxLength: 500 },
                studentId: {
                    type: "string",
                    pattern: "^\\d{10}$",
                    description: "Corrected student id when OCR misread it",
                },
            },
        },
    })
    @ApiResponse({ status: 200, description: "Decision recorded" })
    @ApiErrors(400, 401, 403, 404, 409, 500)
    decide(
        @Param("id", ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(kycDecisionSchema)) body: KycDecision,
        @CurrentUser() admin: UserProfile,
    ) {
        return this.kyc.decide(id, admin.id, body);
    }
}
