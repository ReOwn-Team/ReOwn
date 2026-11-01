import { ProductPhotoService } from "../inspection/product-photo.service";
import { ProductReviewService } from "../inspection/product-review.service";
import { ProductReviewsController } from "../inspection/product-reviews.controller";
import { ProductInspectionWorker } from "../inspection/product-inspection.worker";
import { OpenRouterInspectionProvider } from "../inspection/openrouter-inspection.provider";
import { PRODUCT_INSPECTION_PROVIDER } from "../inspection/inspection-report";
import { AdminGuard } from "../inspection/admin.guard";
import { ProductStorageService } from "../storage/product-storage.service";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "./users.module";
import {
    ProductsController,
    ProductImagesController,
} from "../controllers/products.controller";
import { ProductsService } from "../services/products.service";
@Module({
    imports: [PrismaModule, UsersModule],
    controllers: [
        ProductsController,
        ProductImagesController,
        ProductReviewsController,
    ],
    providers: [
        ProductsService,
        ProductStorageService,
        ProductPhotoService,
        ProductReviewService,
        ProductInspectionWorker,
        AdminGuard,
        {
            provide: PRODUCT_INSPECTION_PROVIDER,
            useClass: OpenRouterInspectionProvider,
        },
    ],
})
export class ProductsModule {}
