import "dotenv/config";
import { ProductsModule } from "./modules/products.module";
import { AdminModule } from "./modules/admin.module";
import { KycModule } from "./modules/kyc.module";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./modules/users.module";

@Module({
    imports: [
        PrismaModule,
        UsersModule,
        ProductsModule,
        KycModule,
        AdminModule,
    ],
    controllers: [HealthController],
    exports: [PrismaModule],
})
export class AppModule {}
