import { Body, Controller, Delete, Header, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../decorators/current-user.decorator";
import { AccessTokenGuard } from "../guards/access-token.guard";
import type { UserProfile } from "../models/user.model";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { ApiErrors } from "../openapi/decorators";
import { pushSubscriptionSchema, pushUnsubscribeSchema, type PushSubscriptionInput } from "./push.schemas";
import { PushService } from "./push.service";

const endpoint = { type: "string" as const, maxLength: 2048, description: "HTTPS endpoint on an allowed push provider host" };
@ApiTags("push")
@ApiBearerAuth("accessToken")
@UseGuards(AccessTokenGuard)
@Controller({ path: "push/subscriptions", version: "1" })
export class PushController {
    constructor(private readonly push: PushService) {}

    @Post()
    @HttpCode(204)
    @Header("Cache-Control", "no-store")
    @ApiOperation({ operationId: "pushSubscribe", summary: "Register or update a push subscription (maximum 10 per user)" })
    @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["endpoint", "keys"], properties: { endpoint, keys: { type: "object", additionalProperties: false, required: ["p256dh", "auth"], properties: { p256dh: { type: "string" }, auth: { type: "string" } } } } } })
    @ApiResponse({ status: 204, description: "Subscription saved" })
    @ApiErrors(400, 401, 409, 500)
    subscribe(@CurrentUser() user: UserProfile, @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionInput) {
        return this.push.subscribe(user.id, body);
    }

    @Delete()
    @HttpCode(204)
    @Header("Cache-Control", "no-store")
    @ApiOperation({ operationId: "pushUnsubscribe", summary: "Remove the current user's push subscription" })
    @ApiBody({ schema: { type: "object", additionalProperties: false, required: ["endpoint"], properties: { endpoint } } })
    @ApiResponse({ status: 204, description: "Subscription removed or already absent" })
    @ApiErrors(400, 401, 500)
    unsubscribe(@CurrentUser() user: UserProfile, @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: { endpoint: string }) {
        return this.push.unsubscribe(user.id, body.endpoint);
    }
}
