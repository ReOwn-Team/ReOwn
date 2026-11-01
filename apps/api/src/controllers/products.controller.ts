import type {} from "multer";
import {
    Body,
    Delete,
    HttpCode,
    Controller,
    Get,
    Header,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    Res,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
    BadRequestException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../decorators/current-user.decorator";
import { productInputSchema, productStatusSchema } from "../dtos/product.dto";
import { AccessTokenGuard } from "../guards/access-token.guard";
import type { UserProfile } from "../models/user.model";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { ProductsService } from "../services/products.service";
import { ApiErrors } from "../openapi/decorators";
const uploads = FilesInterceptor("files", 6, {
    limits: {
        fileSize: 5 * 1024 * 1024,
        fields: 1,
        fieldSize: 16384,
        parts: 7,
    },
});
const multipart = {
    required: true,
    schema: {
        type: "object" as const,
        required: ["data"],
        properties: {
            data: {
                type: "string" as const,
                description: "JSON matching ProductInput",
            },
            files: {
                type: "array" as const,
                maxItems: 6,
                items: { type: "string" as const, format: "binary" },
            },
        },
    },
};
const productResponse = {
    status: 200,
    schema: { $ref: "#/components/schemas/ProductResponse" },
};
function parseData(value: unknown) {
    let body: unknown;
    try {
        body = typeof value === "string" ? JSON.parse(value) : null;
    } catch {
        throw new BadRequestException("Invalid listing data");
    }
    return new ZodValidationPipe(productInputSchema).transform(body);
}
@ApiTags("products")
@Controller({ path: "products", version: "1" })
export class ProductsController {
    constructor(private readonly products: ProductsService) {}
    @Get()
    @ApiOperation({
        operationId: "productsList",
        summary: "List up to 100 published listings",
    })
    @ApiResponse({
        status: 200,
        schema: {
            type: "array",
            items: { $ref: "#/components/schemas/ProductResponse" },
        },
    })
    @ApiErrors(500)
    list() {
        return this.products.list();
    }

    @Get("mine")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @ApiOperation({
        operationId: "productsMine",
        summary: "List the current seller's listings",
    })
    @ApiResponse({
        status: 200,
        schema: {
            type: "array",
            items: { $ref: "#/components/schemas/ProductResponse" },
        },
    })
    @ApiErrors(401, 500)
    @Header("Cache-Control", "no-store")
    mine(@CurrentUser() user: UserProfile) {
        return this.products.list(user.id);
    }

    @Get("mine/:id/images/:imageId")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @ApiOperation({
        operationId: "productImageOwned",
        summary: "Read a metadata-free image belonging to an owned listing",
    })
    async ownedImage(
        @Param("id", ParseUUIDPipe) id: string,
        @Param("imageId", ParseUUIDPipe) imageId: string,
        @CurrentUser() user: UserProfile,
        @Res() response: Response,
    ) {
        response.setHeader("Content-Type", "image/webp");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.send(await this.products.image(imageId, user.id, id));
    }
    @Get("mine/:id/inspection")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @Header("Cache-Control", "no-store")
    @ApiOperation({
        operationId: "productOwnerInspection",
        summary: "Read observations for your current listing revision",
    })
    @ApiResponse({
        status: 200,
        schema: { $ref: "#/components/schemas/ProductOwnerInspection" },
    })
    @ApiErrors(400, 401, 404, 500)
    inspection(
        @Param("id", ParseUUIDPipe) id: string,
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.inspection(id, user.id);
    }
    @Delete(":id")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @HttpCode(204)
    @ApiOperation({
        operationId: "productsDelete",
        summary: "Soft-delete your unsold listing without orders",
    })
    @ApiResponse({
        status: 204,
        description: "Listing removed; review history retained",
    })
    @ApiErrors(400, 401, 404, 409, 500)
    remove(
        @Param("id", ParseUUIDPipe) id: string,
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.remove(id, user.id);
    }
    @Get("mine/:id")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @ApiOperation({
        operationId: "productsGetMine",
        summary: "Read a listing owned by the current seller",
    })
    @ApiResponse(productResponse)
    @ApiErrors(400, 401, 404, 500)
    @Header("Cache-Control", "no-store")
    getMine(
        @Param("id", ParseUUIDPipe) id: string,
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.get(id, user.id);
    }

    @Get(":id")
    @ApiOperation({
        operationId: "productsGet",
        summary: "Read a published listing",
    })
    @ApiResponse(productResponse)
    @ApiErrors(400, 404, 500)
    get(@Param("id", ParseUUIDPipe) id: string) {
        return this.products.get(id);
    }

    @Post()
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @UseInterceptors(uploads)
    @ApiOperation({
        operationId: "productsCreate",
        summary: "Publish a listing with 1–6 real photos",
    })
    @ApiConsumes("multipart/form-data")
    @ApiBody(multipart)
    @ApiResponse({ ...productResponse, status: 201 })
    @ApiErrors(400, 401, 409, 413, 500, 503)
    create(
        @Body("data") value: unknown,
        @UploadedFiles() files: Express.Multer.File[],
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.save(user.id, parseData(value), files ?? []);
    }

    @Put(":id")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @UseInterceptors(uploads)
    @ApiOperation({
        operationId: "productsUpdate",
        summary: "Update your unsold listing and photo order",
    })
    @ApiConsumes("multipart/form-data")
    @ApiBody(multipart)
    @ApiResponse(productResponse)
    @ApiErrors(400, 401, 404, 409, 413, 500, 503)
    update(
        @Param("id", ParseUUIDPipe) id: string,
        @Body("data") value: unknown,
        @UploadedFiles() files: Express.Multer.File[],
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.save(user.id, parseData(value), files ?? [], id);
    }

    @Patch(":id/status")
    @UseGuards(AccessTokenGuard)
    @ApiBearerAuth("accessToken")
    @ApiOperation({
        operationId: "productsStatus",
        summary: "Hide, republish or mark your listing sold",
    })
    @ApiBody({
        required: true,
        schema: { $ref: "#/components/schemas/ProductStatusRequest" },
    })
    @ApiResponse(productResponse)
    @ApiErrors(400, 401, 404, 409, 500)
    status(
        @Param("id", ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(productStatusSchema))
        body: { status: "published" | "hidden" | "sold" },
        @CurrentUser() user: UserProfile,
    ) {
        return this.products.status(id, user.id, body.status);
    }
}
@ApiTags("products")
@Controller({ path: "product-images", version: "1" })
export class ProductImagesController {
    constructor(private readonly products: ProductsService) {}
    @Get(":id")
    @ApiOperation({
        operationId: "productImageGet",
        summary: "Read a public product photo",
    })
    @ApiResponse({
        status: 200,
        content: {
            "image/webp": { schema: { type: "string", format: "binary" } },
        },
    })
    @ApiErrors(400, 404, 500, 503)
    async get(
        @Param("id", ParseUUIDPipe) id: string,
        @Res() response: Response,
    ) {
        response.setHeader("Content-Type", "image/webp");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "no-store");
        response.send(await this.products.image(id));
    }
}
