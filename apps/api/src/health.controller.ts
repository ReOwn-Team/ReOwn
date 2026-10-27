import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { schemaRef } from "./openapi/decorators";

@ApiTags("health")
@Controller("health")
export class HealthController {
    @ApiOperation({
        operationId: "healthCheck",
        summary: "Check API liveness",
        description: "Reports process liveness, not database readiness.",
    })
    @ApiOkResponse({ schema: schemaRef("HealthResponse") })
    @Get()
    check(): { status: string } {
        return { status: "ok" };
    }
}
