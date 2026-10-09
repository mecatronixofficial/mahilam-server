import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { tap } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { AuthUser } from "../decorators/current-user.decorator.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SECRET_KEYS = new Set(["password", "currentPassword", "newPassword", "passwordHash", "token"]);

/** Records every successful write made by a signed-in user in AuditLog, without delaying the response. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!MUTATING.has(req.method)) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        const user = req.user;
        if (!user) return;
        const path = (req.route?.path as string | undefined) ?? req.path;
        const module = path.replace(/^\/?api\/v1\//, "").split("/")[0] || "root";
        if (module === "auth") return;
        const entityId = (req.params?.id as string | undefined) ?? result?.data?.id ?? null;

        this.prisma.auditLog
          .create({
            data: {
              userId: user.id,
              action: `${req.method} ${path}`,
              module,
              entityId: typeof entityId === "string" ? entityId : null,
              newValue: this.sanitize(req.body),
              ip: req.ip ?? null,
              userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
            },
          })
          .catch((error) => this.logger.warn(`Audit log write failed: ${error instanceof Error ? error.message : error}`));
      }),
    );
  }

  private sanitize(body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (SECRET_KEYS.has(key)) clean[key] = "[redacted]";
      else if (typeof value === "string" && value.length > 2000) clean[key] = `${value.slice(0, 2000)}…`;
      else clean[key] = value;
    }
    return clean as any;
  }
}
