import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "./users.module";
import { AdminGuard } from "../inspection/admin.guard";
import {
    KycAdminController,
    KycController,
} from "../controllers/kyc.controller";
import { KycCryptoService } from "../kyc/security/kyc-crypto.service";
import {
    KYC_ANALYZER,
    KycAnalysisService,
} from "../kyc/analysis/kyc-analysis.service";
import { KycService } from "../services/kyc.service";

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
