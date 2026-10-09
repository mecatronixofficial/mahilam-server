import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiCookieAuth } from "@nestjs/swagger";
import { Role } from "../../generated/prisma/enums.js";
import { JwtAuthGuard } from "../guards/jwt-auth.guard.js";
import { RolesGuard } from "../guards/roles.guard.js";
import { Roles } from "./roles.decorator.js";

export const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

/** Requires a valid session; when roles are given, the user must hold one of them. */
export function Auth(...roles: Role[]) {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(...roles), ApiCookieAuth());
}

/** Shorthand for SUPER_ADMIN or ADMIN only. */
export const AdminOnly = () => Auth(...ADMIN_ROLES);
