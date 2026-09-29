import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { FeesService } from "../fees/fees.service";

const AUDIT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 365);

/** Background housekeeping. Set DISABLE_CRON=true on extra instances so jobs run once. */
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
    if (!this.enabled) return;
    await this.run("purge expired sessions", async () => (await this.prisma.refreshSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })).count);
  }

  @Cron("0 30 0 * * *", { timeZone: process.env.TZ || "Asia/Kolkata" })
  async markOverdueFees() {
    if (!this.enabled) return;
    await this.run("mark overdue fees", async () => (await this.fees.markOverdue()).count);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async pruneAuditLog() {
    if (!this.enabled) return;
    const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 864e5);
    await this.run("prune audit log", async () => (await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })).count);
  }

  private async run(name: string, job: () => Promise<number>) {
    try {
      const count = await job();
      if (count) this.logger.log(`${name}: ${count} row(s)`);
    } catch (error) {
      this.logger.error(`${name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
