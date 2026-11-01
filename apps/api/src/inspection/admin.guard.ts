import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        if (
            context.switchToHttp().getRequest<{ user?: { role: string } }>()
                .user?.role !== "admin"
        )
            throw new ForbiddenException();
        return true;
    }
}
