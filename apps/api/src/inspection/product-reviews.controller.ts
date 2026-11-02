import {
    Body,
    Controller,
    Get,
    Header,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Res,
    UseGuards,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { z } from "zod";
import type { Response } from "express";
import { AccessTokenGuard } from "../guards/access-token.guard";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { UserProfile } from "../models/user.model";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AdminGuard } from "./admin.guard";
import { ProductReviewService } from "./product-review.service";
import {
    decisionRequestSchema as decisionSchema,
    editRequestSchema as editSchema,
} from "./inspection.schemas";
@ApiTags("product-reviews")
@ApiBearerAuth("accessToken")
@UseGuards(AccessTokenGuard, AdminGuard)
@Controller({ path: "admin/product-reviews", version: "1" })
export class ProductReviewsController {
    constructor(private readonly reviews: ProductReviewService) {}
    @Get()
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewsList",
        summary: "Admin: list up to 50 current pending reviews",
    })
    @ApiQuery({ name: "cursor", required: false, type: String })
    @ApiResponse({
        status: 200,
        description: "Pending review summaries with revision and AI job status",
        schema: {
            type: "array",
            items: { $ref: "#/components/schemas/ProductReviewSummary" },
        },
    })
    list(
        @Query("cursor", new ZodValidationPipe(z.string().uuid().optional()))
        cursor?: string,
    ) {
        return this.reviews.list(cursor);
    }
    @Get(":id")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewDetail",
        summary: "Admin: review snapshot, private metadata, inspection history",
    })
    @ApiResponse({
        status: 200,
        description:
            "Review detail; inspection reports are observations, never verdicts",
    })
    detail(@Param("id", ParseUUIDPipe) id: string) {
        return this.reviews.detail(id);
    }
    @Get(":id/images/:imageId")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewImage",
        summary: "Admin: metadata-free review image",
    })
    async image(
        @Param("id", ParseUUIDPipe) id: string,
        @Param("imageId", ParseUUIDPipe) imageId: string,
        @Res() response: Response,
    ) {
        return this.send(
            response,
            await this.reviews.image(id, imageId, false),
        );
    }
    @Get(":id/originals/:imageId")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewOriginal",
        summary: "Admin: private original, unavailable after 30 days",
    })
    async original(
        @Param("id", ParseUUIDPipe) id: string,
        @Param("imageId", ParseUUIDPipe) imageId: string,
        @Res() response: Response,
    ) {
        return this.send(response, await this.reviews.image(id, imageId, true));
    }
    private send(response: Response, image: { bytes: Buffer; mime: string }) {
        response.setHeader("Content-Type", image.mime);
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Disposition", "inline");
        response.send(image.bytes);
    }
    @ApiResponse({
        status: 201,
        schema: { $ref: "#/components/schemas/ProductReviewEdit" },
    })
    @Post(":id/edits")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewEdit",
        summary:
            "Admin: correct listing metadata and request seller confirmation; price and images cannot be changed",
    })
    @ApiBody({
        schema: { $ref: "#/components/schemas/ProductReviewEditRequest" },
    })
    edit(
        @Param("id", ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(editSchema))
        body: z.infer<typeof editSchema>,
        @CurrentUser() user: UserProfile,
    ) {
        return this.reviews.edit(
            id,
            body.revision,
            body.changes,
            body.note,
            user.id,
        );
    }
    @ApiResponse({
        status: 201,
        schema: { $ref: "#/components/schemas/ProductReviewDecision" },
    })
    @Post(":id/decision")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewDecision",
        summary: "Admin: approve/reject the current pending revision",
    })
    @ApiBody({
        schema: {
            type: "object",
            additionalProperties: false,
            required: ["revision", "decision"],
            properties: {
                revision: { type: "integer", minimum: 1 },
                decision: { type: "string", enum: ["approve", "reject"] },
                reason: { type: "string", maxLength: 2000 },
            },
        },
    })
    decide(
        @Param("id", ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(decisionSchema))
        body: z.infer<typeof decisionSchema>,
        @CurrentUser() user: UserProfile,
    ) {
        return this.reviews.decide(
            id,
            body.revision,
            body.decision,
            body.reason,
            user.id,
        );
    }
    @ApiResponse({
        status: 201,
        schema: { $ref: "#/components/schemas/ProductInspection" },
    })
    @Post(":id/inspections")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productReviewRetry",
        summary:
            "Admin: create a new inspection attempt for current pending review",
    })
    retry(@Param("id", ParseUUIDPipe) id: string) {
        return this.reviews.retry(id);
    }
}
