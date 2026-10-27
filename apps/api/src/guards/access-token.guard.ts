import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import type { UserProfile } from "../models/user.model";
import { AccessTokenProvider } from "../providers/access-token.provider";
import { UsersService } from "../services/users.service";
import { SessionsService } from "../services/sessions.service";

@Injectable()
export class AccessTokenGuard implements CanActivate {
    constructor(
        private readonly tokens: AccessTokenProvider,
        private readonly users: UsersService,
        private readonly sessions: SessionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: UserProfile;
        }>();
        const header = request.headers.authorization;
        const match =
            typeof header === "string" && header.length <= 4096
                ? /^Bearer (\S+)$/i.exec(header)
                : null;
        if (!match) {
            throw new UnauthorizedException("Bearer access token is required");
        }
        const { userId, familyId } = this.tokens.verify(match[1]);
        await this.sessions.assertActive(userId, familyId);
        request.user = await this.users.findActiveProfile(userId);
        return true;
    }
}
