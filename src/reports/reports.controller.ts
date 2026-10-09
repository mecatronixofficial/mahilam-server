import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { ReportsService } from "./reports.service.js";
import { AuditQueryDto, RangeQueryDto } from "./dto/reports.dto.js";

@ApiTags("reports")
@Controller("reports")
@Auth()
export class ReportsController {
  constructor(private s: ReportsService) {}

  @Get("dashboard")
  async dashboard() {
    return { success: true, data: await this.s.dashboard() };
  }

  @Get("enquiries")
  async enquiries(@Query() range: RangeQueryDto) {
    return { success: true, data: await this.s.enquiries(range) };
  }

  @Get("admissions")
  async admissions(@Query() range: RangeQueryDto) {
    return { success: true, data: await this.s.admissions(range) };
  }

  @Get("fees")
  @AdminOnly()
  async fees(@Query() range: RangeQueryDto) {
    return { success: true, data: await this.s.fees(range) };
  }

  @Get("audit-logs")
  @AdminOnly()
  auditLogs(@Query() query: AuditQueryDto) {
    return this.s.auditLogs(query);
  }

  // Exports contain personal data, so they are limited to admins.

  @Get("export/enquiries.csv")
  @AdminOnly()
  @ApiProduces("text/csv")
  async exportEnquiries(@Query() range: RangeQueryDto, @Res({ passthrough: true }) res: Response) {
    return this.csv(res, "enquiries", await this.s.enquiriesCsv(range));
  }

  @Get("export/students.csv")
  @AdminOnly()
  @ApiProduces("text/csv")
  async exportStudents(@Res({ passthrough: true }) res: Response) {
    return this.csv(res, "students", await this.s.studentsCsv());
  }

  @Get("export/fees.csv")
  @AdminOnly()
  @ApiProduces("text/csv")
  async exportFees(@Res({ passthrough: true }) res: Response) {
    return this.csv(res, "fees", await this.s.feesCsv());
  }

  @Get("export/payments.csv")
  @AdminOnly()
  @ApiProduces("text/csv")
  async exportPayments(@Query() range: RangeQueryDto, @Res({ passthrough: true }) res: Response) {
    return this.csv(res, "payments", await this.s.paymentsCsv(range));
  }

  private csv(res: Response, name: string, body: string) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="little-mahilam-${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    return body;
  }
}
