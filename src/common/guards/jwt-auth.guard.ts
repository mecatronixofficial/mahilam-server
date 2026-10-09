import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { authCookieNames } from "../../auth/auth.constants.js";
import type { AuthUser } from "../decorators/current-user.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[authCookieNames().access];
    if (!token) throw new UnauthorizedException("Authentication required");
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      if (payload.type !== "access" || !payload.sub) throw new Error();
      const user: AuthUser = { id: payload.sub, sub: payload.sub, email: payload.email, name: payload.name, role: payload.role };
      (req as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired session");
    }
  }
}
