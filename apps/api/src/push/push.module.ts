import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../modules/users.module";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

@Module({ imports: [PrismaModule, UsersModule], controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
