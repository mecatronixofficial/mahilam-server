import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Role } from "../../generated/prisma/enums.js";

export type AuthUser = { id: string; sub: string; email: string; name: string; role: Role };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
