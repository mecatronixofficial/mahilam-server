import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../decorators/current-user.decorator.js";
import type { Prisma } from "../../generated/prisma/client.js";

export const isAdministrator = (user: Pick<AuthUser, "role">) => ["ADMIN", "SUPER_ADMIN"].includes(user.role);
export const canApprove = (user: Pick<AuthUser, "role">) => isAdministrator(user) || user.role === "ADMISSION_MANAGER";
export const isCounsellor = (user: Pick<AuthUser, "role">) => ["STAFF", "COUNSELLOR"].includes(user.role);
export function requireApprovalRole(user: AuthUser) { if (!canApprove(user)) throw new ForbiddenException("Admission approval requires an admission manager or administrator"); }
export function enquiryScope(user: AuthUser): Prisma.EnquiryWhereInput { return isCounsellor(user) ? { assignedStaffId: user.id } : {}; }
export function assertEnquiryAccess(enquiry: { assignedStaffId: string | null } | null, user: AuthUser) {
  if (!enquiry || (isCounsellor(user) && enquiry.assignedStaffId !== user.id)) throw new NotFoundException("Enquiry not found");
}
export function canAccessEndpoint(role: string, method: string, originalPath: string) {
  if (["ADMIN", "SUPER_ADMIN"].includes(role)) return true;
  const path = originalPath.split("?")[0].replace(/^\/api\/v1/, "").replace(/\/$/, "") || "/";
  const read = method === "GET" || method === "HEAD";
  if (path.startsWith("/auth")) return true;
  if (["STAFF", "COUNSELLOR"].includes(role)) {
    return /^\/(crm|enquiries|admissions)(\/|$)/.test(path)
      && !/^\/crm\/(settings|guardians|attendance|visit-slots|templates)/.test(path)
      || read && (/^\/academics\//.test(path) || path === "/staff");
  }
  if (role === "ADMISSION_MANAGER") return /^\/(crm|enquiries|admissions|students)(\/|$)/.test(path) || read && /^\/(academics|staff|reports)(\/|$)/.test(path);
  if (role === "ACCOUNTANT") return /^\/fees(\/|$)/.test(path) || read && (/^\/(students|academics|crm\/(guardians|reports))(\/|$)/.test(path) || /^\/reports\/(fees|export\/(fees|payments|students)\.csv)$/.test(path));
  if (role === "TEACHER") return /^\/crm\/attendance(\/|$)/.test(path) || read && (/^\/(students|academics)(\/|$)/.test(path) || /^\/crm\/reports\/attendance(\/|$)/.test(path));
  if (role === "CMS_EDITOR") return /^\/(cms|branding|newsletter)(\/|$)/.test(path) || method === "POST" && path === "/integrations/uploads/image";
  return false;
}
