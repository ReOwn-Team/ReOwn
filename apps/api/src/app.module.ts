import "dotenv/config";
import { ProductsModule } from "./modules/products.module";
import { KycModule } from "./kyc/kyc.module";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./modules/users.module";

@Module({
    imports: [PrismaModule, UsersModule, ProductsModule, KycModule],
    controllers: [HealthController],
    exports: [PrismaModule],
})
export class AppModule {}
