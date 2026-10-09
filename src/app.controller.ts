import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "./prisma/prisma.service.js";

@ApiTags("health")
@Controller("health")
@SkipThrottle()
export class AppController {
  constructor(private prisma: PrismaService) {}

  /** Liveness: the process is up. */
  @Get()
  health() {
    return { success: true, message: "Little Mahilam API is healthy", timestamp: new Date().toISOString() };
  }

  /** Readiness: the database is reachable. */
  @Get("ready")
  async ready() {
    const started = Date.now();
    try {
      await this.prisma.ping();
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }
    return { success: true, database: "up", latencyMs: Date.now() - started, uptimeSeconds: Math.round(process.uptime()) };
  }
}
