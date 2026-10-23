import { CanActivate, ExecutionContext, Injectable, Logger, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../../generated/prisma/enums.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { canAccessEndpoint } from "../utils/crm-policy.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, @Optional() private prisma?: PrismaService) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;
    const allowed = roles?.length ? roles.includes(user.role) : canAccessEndpoint(user.role, request.method, request.originalUrl ?? request.url ?? "");
    if (!allowed && this.prisma?.auditLog) {
      const path = String(request.originalUrl ?? request.url ?? "").split("?")[0];
      void this.prisma.auditLog.create({ data: { userId: user.id, module: "authorization", action: "ACCESS_DENIED", entityId: path, newValue: { method: request.method, role: user.role } } }).catch(() => new Logger("RolesGuard").warn("Could not persist access-denied audit"));
    }
    return allowed;
  }
}
