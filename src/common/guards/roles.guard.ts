import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../../generated/prisma/enums";
import { ROLES_KEY } from "../decorators/roles.decorator";
@Injectable()
export class RolesGuard implements CanActivate { constructor(private reflector:Reflector){} canActivate(ctx:ExecutionContext){const roles=this.reflector.getAllAndOverride<Role[]>(ROLES_KEY,[ctx.getHandler(),ctx.getClass()]);if(!roles?.length)return true;const user=ctx.switchToHttp().getRequest().user;return !!user&&roles.includes(user.role)}}
