import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { Auth } from "../common/decorators/auth.decorator.js";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator.js";
import { authCookieNames, authCookieOptions } from "./auth.constants.js";
import { ACCESS_TTL_MS, AuthService, REFRESH_TTL_MS } from "./auth.service.js";
import { ChangePasswordDto, LoginDto } from "./dto/login.dto.js";

const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.validate(dto.email, dto.password);
    const out = await this.auth.issue(user);
    this.setCookies(res, out.access, out.refresh);
    return { success: true, message: "Login successful", data: out.user };
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.refresh(req.cookies?.[authCookieNames().refresh]);
    this.setCookies(res, out.access, out.refresh);
    return { success: true, data: out.user };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const names = authCookieNames();
    const options = authCookieOptions();
    await this.auth.logout(req.cookies?.[names.refresh]);
    res.setHeader("Cache-Control", "no-store");
    res.clearCookie(names.access, options);
    res.clearCookie(names.refresh, options);
    return { success: true, message: "Logged out" };
  }

  @Get("me")
  @Auth()
  async me(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return { success: true, data: await this.auth.me(user.id) };
  }

  @Post("change-password")
  @HttpCode(200)
  @Auth()
  @Throttle(AUTH_LIMIT)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    this.setCookies(res, out.access, out.refresh);
    return { success: true, message: "Password changed. Other devices have been signed out.", data: out.user };
  }

  private setCookies(res: Response, access: string, refresh: string) {
    const names = authCookieNames();
    const options = authCookieOptions();
    res.setHeader("Cache-Control", "no-store");
    res.cookie(names.access, access, { ...options, maxAge: ACCESS_TTL_MS });
    res.cookie(names.refresh, refresh, { ...options, maxAge: REFRESH_TTL_MS });
  }
}
