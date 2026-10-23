import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { authCookieNames } from "../../auth/auth.constants.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthUser } from "../decorators/current-user.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[authCookieNames().access];
    if (!token) throw new UnauthorizedException("Authentication required");
    let userId: string;
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
      if (payload.type !== "access" || typeof payload.sub !== "string") throw new Error();
      userId = payload.sub;
    } catch { throw new UnauthorizedException("Invalid or expired session"); }
    // Do not treat a database outage as an invalid password/session.
    const account = await this.prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true, email: true, name: true, role: true } });
    if (!account) throw new UnauthorizedException("Account is no longer active");
    const user: AuthUser = { ...account, sub: account.id };
    (req as Request & { user?: AuthUser }).user = user;
    return true;
  }
}
