import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { UserProfile } from "../models/user.model";

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): UserProfile => {
        const { user } = context.switchToHttp().getRequest<{ user?: UserProfile }>();
        if (!user) {
            throw new UnauthorizedException("Authentication is required");
        }
        return user;
    },
);
