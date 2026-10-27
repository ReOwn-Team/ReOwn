import { Test } from "@nestjs/testing";
import { HealthController } from "../../src/health.controller";

describe("HealthController", () => {
    it("reports API status", async () => {
        const module = await Test.createTestingModule({
            controllers: [HealthController],
        }).compile();

        const controller = module.get(HealthController);
        expect(controller.check()).toEqual({ status: "ok" });
    });
});
