import "dotenv/config";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./modules/users.module";

@Module({
    imports: [PrismaModule, UsersModule],
    controllers: [HealthController],
    exports: [PrismaModule],
})
export class AppModule {}
