import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../modules/users.module";
import { AdminGuard } from "../inspection/admin.guard";
import { KycAdminController, KycController } from "./kyc.controller";
import { KycCryptoService } from "./kyc-crypto.service";
import { KYC_ANALYZER, KycAnalysisService } from "./kyc-analysis.service";
import { KycService } from "./kyc.service";

@Module({
    imports: [PrismaModule, UsersModule],
    controllers: [KycController, KycAdminController],
    providers: [
        KycService,
        KycCryptoService,
        AdminGuard,
        KycAnalysisService,
        { provide: KYC_ANALYZER, useExisting: KycAnalysisService },
    ],
})
export class KycModule {}
