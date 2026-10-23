import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { tap } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthUser } from "../decorators/current-user.decorator.js";
import type { Prisma } from "../../generated/prisma/client.js";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PRIVATE = /password|token|secret|cookie|authorization|content|file|phone|mobile|whatsapp|email|address|dob|parentname|studentname|firstname|lastname|notes|message|body|emergency/i;
export function sanitizeAudit(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return null as unknown as Prisma.InputJsonValue;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeAudit(item, depth + 1));
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "[private binary]";
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, PRIVATE.test(key) ? "[redacted]" : sanitizeAudit(child, depth + 1)]));
  if (typeof value === "string") return value.slice(0, 2000);
  return typeof value === "number" || typeof value === "boolean" ? value : String(value);
}
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private logger = new Logger(AuditInterceptor.name);
  constructor(private prisma: PrismaService) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!MUTATING.has(req.method)) return next.handle();
    return next.handle().pipe(tap(result => {
      if (!req.user) return;
      const path = (req.route?.path as string | undefined) ?? req.path;
      const module = path.replace(/^\/?api\/v1\//, "").split("/")[0] || "root";
      const entityId = req.params?.id ?? result?.data?.id;
      this.prisma.auditLog.create({ data: {
        userId: req.user.id, action: `${req.method} ${path}`, module,
        entityId: typeof entityId === "string" ? entityId : null,
        newValue: req.body ? sanitizeAudit(req.body) : undefined,
        ip: req.ip ?? null, userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
      } }).catch(() => this.logger.warn("Audit log write failed"));
    }));
  }
}
