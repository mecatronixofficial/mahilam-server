import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { AdmissionStatus, EnquiryStatus, PaymentStatus, StudentStatus } from "../generated/prisma/enums.js";
import { pageArgs, paginated } from "../common/utils/pagination.js";
import { AuditQueryDto, RangeQueryDto } from "./dto/reports.dto.js";

const OPEN_FEE_STATUSES = [PaymentStatus.PENDING, PaymentStatus.PARTIAL, PaymentStatus.OVERDUE];
const Decimal = Prisma.Decimal;

type Monthly = { month: string; count: number; total?: Prisma.Decimal };

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const [students, enquiries, admissions, pendingFees, events, totalEnquiries, enquiriesThisMonth, followUpsDue, collected, open] = await Promise.all([
      this.prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
      this.prisma.enquiry.count({ where: { status: EnquiryStatus.NEW } }),
      this.prisma.admission.count({ where: { status: AdmissionStatus.CONFIRMED } }),
      this.prisma.studentFee.count({ where: { status: { in: OPEN_FEE_STATUSES } } }),
      this.prisma.schoolEvent.count({ where: { startDate: { gte: now }, active: true } }),
      this.prisma.enquiry.count(),
      this.prisma.enquiry.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.enquiry.count({ where: { nextFollowUpDate: { lte: endOfToday }, status: { notIn: [EnquiryStatus.ADMISSION_CONFIRMED, EnquiryStatus.NOT_INTERESTED, EnquiryStatus.CLOSED] } } }),
      this.prisma.payment.aggregate({ where: { voided: false, paidAt: { gte: monthStart } }, _sum: { amount: true } }),
      this.prisma.studentFee.aggregate({ where: { status: { in: OPEN_FEE_STATUSES } }, _sum: { originalAmount: true, discount: true, fine: true, paid: true } }),
    ]);
    return {
      students,
      enquiries,
      admissions,
      pendingFees,
      events,
      totalEnquiries,
      enquiriesThisMonth,
      followUpsDue,
      collectedThisMonth: collected._sum.amount ?? new Decimal(0),
      outstandingFees: outstanding(open._sum),
    };
  }

  async enquiries(range: RangeQueryDto) {
    const where: Prisma.EnquiryWhereInput = { createdAt: dateRange(range) };
    const [byStatus, bySource, total] = await Promise.all([
      this.prisma.enquiry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.enquiry.groupBy({ by: ["source"], where, _count: { _all: true } }),
      this.prisma.enquiry.count({ where }),
    ]);
    const converted = byStatus.find((row) => row.status === EnquiryStatus.ADMISSION_CONFIRMED)?._count._all ?? 0;
    return {
      total,
      conversionRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      bySource: bySource.map((row) => ({ source: row.source, count: row._count._all })),
      monthly: await this.monthly("Enquiry", "createdAt", range),
    };
  }

  async admissions(range: RangeQueryDto) {
    const where: Prisma.AdmissionWhereInput = { createdAt: dateRange(range) };
    const byStatus = await this.prisma.admission.groupBy({ by: ["status"], where, _count: { _all: true } });
    return {
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      monthly: await this.monthly("Admission", "createdAt", range),
    };
  }

  async fees(range: RangeQueryDto) {
    const paymentWhere: Prisma.PaymentWhereInput = { voided: false, paidAt: dateRange(range) };
    const [totals, byStatus, byMethod, collected, monthly] = await Promise.all([
      this.prisma.studentFee.aggregate({ _sum: { originalAmount: true, discount: true, fine: true, paid: true } }),
      this.prisma.studentFee.groupBy({ by: ["status"], _count: { _all: true }, _sum: { originalAmount: true, discount: true, fine: true, paid: true } }),
      this.prisma.payment.groupBy({ by: ["method"], where: paymentWhere, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true }, _count: { _all: true } }),
      this.monthly("Payment", "paidAt", range, true),
    ]);
    const billed = new Decimal(totals._sum.originalAmount ?? 0).minus(totals._sum.discount ?? 0).plus(totals._sum.fine ?? 0);
    return {
      billed,
      discounts: totals._sum.discount ?? new Decimal(0),
      fines: totals._sum.fine ?? new Decimal(0),
      paid: totals._sum.paid ?? new Decimal(0),
      outstanding: outstanding(byStatus.filter((row) => OPEN_FEE_STATUSES.includes(row.status as (typeof OPEN_FEE_STATUSES)[number])).reduce(sumFees, emptySums())),
      collectedInRange: { amount: collected._sum.amount ?? new Decimal(0), payments: collected._count._all },
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all, paid: row._sum.paid ?? new Decimal(0) })),
      byMethod: byMethod.map((row) => ({ method: row.method, count: row._count._all, amount: row._sum.amount ?? new Decimal(0) })),
      monthly,
    };
  }

  async auditLogs(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = { module: query.module, userId: query.userId, createdAt: dateRange(query) };
    // The log grows without bound, so it is always paginated (50 per page by default).
    const page = { ...query, limit: query.limit ?? 50 };
    const result = await paginated(page, this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(page) }), () => this.prisma.auditLog.count({ where }));
    const userIds = [...new Set(result.data.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
    const byId = new Map(users.map((user) => [user.id, user]));
    return { ...result, data: result.data.map((row) => ({ ...row, user: row.userId ? (byId.get(row.userId) ?? null) : null })) };
  }

  // ---- CSV exports ----

  async enquiriesCsv(range: RangeQueryDto) {
    const rows = await this.prisma.enquiry.findMany({ where: { createdAt: dateRange(range) }, orderBy: { createdAt: "desc" } });
    return toCsv(
      ["Enquiry No", "Date", "Parent", "Student", "Phone", "WhatsApp", "Email", "Class", "Source", "Status", "Next follow-up", "Message"],
      rows.map((r) => [r.enquiryNumber, day(r.createdAt), r.parentName, r.studentName, r.phone, r.whatsapp, r.email, r.interestedClass, r.source, r.status, day(r.nextFollowUpDate), r.message]),
    );
  }

  async studentsCsv() {
    const rows = await this.prisma.student.findMany({ include: { classLevel: { select: { name: true } }, section: { select: { name: true } } }, orderBy: [{ classLevel: { displayOrder: "asc" } }, { firstName: "asc" }] });
    return toCsv(
      ["Admission No", "First name", "Last name", "Class", "Section", "Status", "Date of birth", "Gender", "Phone", "WhatsApp", "Joining date"],
      rows.map((r) => [r.admissionNumber, r.firstName, r.lastName, r.classLevel?.name, r.section?.name, r.status, day(r.dob), r.gender, r.phone, r.whatsapp, day(r.joiningDate)]),
    );
  }

  async feesCsv() {
    const rows = await this.prisma.studentFee.findMany({ include: { student: { select: { admissionNumber: true, firstName: true, lastName: true } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }] });
    return toCsv(
      ["Admission No", "Student", "Fee", "Amount", "Discount", "Fine", "Paid", "Balance", "Status", "Due date"],
      rows.map((r) => {
        const payable = new Decimal(r.originalAmount).minus(r.discount).plus(r.fine);
        return [r.student.admissionNumber, [r.student.firstName, r.student.lastName].filter(Boolean).join(" "), r.label, r.originalAmount, r.discount, r.fine, r.paid, Decimal.max(0, payable.minus(r.paid)), r.status, day(r.dueDate)];
      }),
    );
  }

  async paymentsCsv(range: RangeQueryDto) {
    const rows = await this.prisma.payment.findMany({
      where: { paidAt: dateRange(range) },
      include: { studentFee: { select: { label: true, student: { select: { admissionNumber: true, firstName: true, lastName: true } } } } },
      orderBy: { paidAt: "desc" },
    });
    return toCsv(
      ["Receipt No", "Date", "Admission No", "Student", "Fee", "Amount", "Method", "Voided", "Notes"],
      rows.map((r) => [r.receiptNumber, day(r.paidAt), r.studentFee.student.admissionNumber, [r.studentFee.student.firstName, r.studentFee.student.lastName].filter(Boolean).join(" "), r.studentFee.label, r.amount, r.method, r.voided ? "Yes" : "No", r.notes]),
    );
  }

  /** Counts (and optionally sums `amount`) per month. Table and column names are fixed literals, never user input. */
  private async monthly(table: "Enquiry" | "Admission" | "Payment", column: "createdAt" | "paidAt", range: RangeQueryDto, withAmount = false): Promise<Monthly[]> {
    const since = range.from ? new Date(range.from) : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
    const until = range.to ? endOfDay(range.to) : new Date();
    const col = Prisma.raw(`"${column}"`);
    const tbl = Prisma.raw(`"${table}"`);
    const amount = withAmount ? Prisma.sql`, COALESCE(SUM("amount"), 0) AS total` : Prisma.empty;
    const voided = table === "Payment" ? Prisma.sql`AND "voided" = false` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ month: string; count: number; total?: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', ${col}), 'YYYY-MM') AS month, COUNT(*)::int AS count ${amount}
      FROM ${tbl}
      WHERE ${col} >= ${since} AND ${col} <= ${until} ${voided}
      GROUP BY 1 ORDER BY 1`;
    return rows;
  }
}

type FeeSums = { originalAmount: Prisma.Decimal | null; discount: Prisma.Decimal | null; fine: Prisma.Decimal | null; paid: Prisma.Decimal | null };

function outstanding(sums: FeeSums) {
  const value = new Decimal(sums.originalAmount ?? 0).minus(sums.discount ?? 0).plus(sums.fine ?? 0).minus(sums.paid ?? 0);
  return Decimal.max(0, value);
}

function emptySums(): FeeSums {
  return { originalAmount: new Decimal(0), discount: new Decimal(0), fine: new Decimal(0), paid: new Decimal(0) };
}

function sumFees(acc: FeeSums, row: { _sum: FeeSums }): FeeSums {
  return {
    originalAmount: new Decimal(acc.originalAmount ?? 0).plus(row._sum.originalAmount ?? 0),
    discount: new Decimal(acc.discount ?? 0).plus(row._sum.discount ?? 0),
    fine: new Decimal(acc.fine ?? 0).plus(row._sum.fine ?? 0),
    paid: new Decimal(acc.paid ?? 0).plus(row._sum.paid ?? 0),
  };
}

function dateRange(range: RangeQueryDto) {
  if (!range.from && !range.to) return undefined;
  return { gte: range.from ? new Date(range.from) : undefined, lte: range.to ? endOfDay(range.to) : undefined };
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function day(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** RFC 4180 CSV with a BOM for Excel. Cells that start like a formula are prefixed so spreadsheets don't execute them. */
function toCsv(header: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
