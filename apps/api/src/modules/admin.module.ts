import { Module } from "@nestjs/common";
import { AdminController } from "../controllers/admin.controller";
import { AdminGuard } from "../inspection/admin.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminService } from "../services/admin.service";
import { UsersModule } from "./users.module";

@Module({
    imports: [PrismaModule, UsersModule],
    controllers: [AdminController],
    providers: [AdminService, AdminGuard],
})
export class AdminModule {}
