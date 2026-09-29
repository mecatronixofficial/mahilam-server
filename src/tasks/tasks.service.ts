import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { FeesService } from "../fees/fees.service";

const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 365);

/**
 * Background housekeeping. On a long-running server the @Cron schedules below run the jobs
 * (set DISABLE_CRON=true on extra instances so they run once). On Vercel, where nothing runs
 * between requests, Vercel Cron calls GET /tasks/run instead (see TasksController).
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly enabled = process.env.DISABLE_CRON !== "true";

  constructor(
    private prisma: PrismaService,
    private fees: FeesService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredSessions() {
    if (this.enabled) await this.run("purge expired sessions", () => this.deleteExpiredSessions());
  }

  @Cron("0 30 0 * * *", { timeZone: process.env.TZ || "Asia/Kolkata" })
  async markOverdueFees() {
    if (this.enabled) await this.run("mark overdue fees", () => this.markFeesOverdue());
  }

  @Cron(CronExpression.EVERY_WEEK)
  async pruneAuditLog() {
    if (this.enabled) await this.run("prune audit log", () => this.deleteOldAuditLogs());
  }

  /** Runs every job once, regardless of DISABLE_CRON. Returns the affected row counts (null when a job failed). */
  async runAll() {
    return {
      expiredSessions: await this.run("purge expired sessions", () => this.deleteExpiredSessions()),
      overdueFees: await this.run("mark overdue fees", () => this.markFeesOverdue()),
      prunedAuditLogs: await this.run("prune audit log", () => this.deleteOldAuditLogs()),
    };
  }

  private async deleteExpiredSessions() {
    return (await this.prisma.refreshSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })).count;
  }

  private async markFeesOverdue() {
    return (await this.fees.markOverdue()).count;
  }

  private async deleteOldAuditLogs() {
    const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 864e5);
    return (await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  }

  private async run(name: string, job: () => Promise<number>) {
    try {
      const count = await job();
      if (count) this.logger.log(`${name}: ${count} row(s)`);
      return count;
    } catch (error) {
      this.logger.error(`${name} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
