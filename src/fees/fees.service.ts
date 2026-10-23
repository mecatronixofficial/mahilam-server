import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthUser } from "../common/decorators/current-user.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SequenceService } from "../prisma/sequence.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { PaymentStatus, StudentStatus } from "../generated/prisma/enums.js";
import { schoolRange } from "../common/utils/school-time.js";
import { toDate, withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import {
  CreateFeeStructureDto,
  CreateFeeTypeDto,
  CreatePaymentDto,
  CreateStudentFeeDto,
  FeeQueryDto,
  PaymentQueryDto,
  UpdateFeeStructureDto,
  UpdateFeeTypeDto,
  UpdateStudentFeeDto,
} from "./dto/create-fee.dto.js";

const Decimal = Prisma.Decimal;
type Amounts = { originalAmount: Prisma.Decimal; discount: Prisma.Decimal; fine: Prisma.Decimal; paid: Prisma.Decimal; dueDate: Date | null };
type Tx = Prisma.TransactionClient;

const STUDENT_SELECT = { select: { id: true, firstName: true, lastName: true, admissionNumber: true, classLevel: { select: { name: true } } } };

export function payableOf(fee: Pick<Amounts, "originalAmount" | "discount" | "fine">) {
  return new Decimal(fee.originalAmount).minus(fee.discount).plus(fee.fine);
}

/** Derives the status from the amounts and due date. */
export function deriveStatus(fee: Amounts): PaymentStatus {
  const payable = payableOf(fee);
  if (new Decimal(fee.paid).gte(payable)) return PaymentStatus.PAID;
  if (fee.dueDate && fee.dueDate < new Date()) return PaymentStatus.OVERDUE;
  return new Decimal(fee.paid).gt(0) ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;
}

@Injectable()
export class FeesService {
  constructor(
    private prisma: PrismaService,
    private sequence: SequenceService,
  ) {}

  // ---- Student fees ----

  list(query: FeeQueryDto) {
    const search = contains(query.search);
    const where: Prisma.StudentFeeWhereInput = {
      status: query.status,
      studentId: query.studentId,
      ...(search ? { OR: [{ label: search }, { student: { firstName: search } }, { student: { lastName: search } }, { student: { admissionNumber: search } }] } : {}),
    };
    return paginated(
      query,
      this.prisma.studentFee.findMany({ where, include: { student: STUDENT_SELECT, payments: { where: { voided: false }, orderBy: { paidAt: "desc" } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], ...pageArgs(query) }),
      () => this.prisma.studentFee.count({ where }),
    );
  }

  async detail(id: string) {
    const fee = await this.prisma.studentFee.findUnique({ where: { id }, include: { student: STUDENT_SELECT, payments: { orderBy: { paidAt: "desc" } } } });
    if (!fee) throw new NotFoundException("Fee not found");
    return { ...fee, payable: payableOf(fee), balance: Decimal.max(0, payableOf(fee).minus(fee.paid)) };
  }

  create(dto: CreateStudentFeeDto) {
    const amounts = { originalAmount: new Decimal(dto.originalAmount), discount: new Decimal(dto.discount ?? 0), fine: new Decimal(dto.fine ?? 0), paid: new Decimal(0), dueDate: toDate(dto.dueDate) ?? null };
    if (payableOf(amounts).lt(0)) throw new BadRequestException("Discount cannot exceed the fee amount plus fine");
    return this.prisma.studentFee.create({ data: { studentId: dto.studentId, label: dto.label, ...amounts, status: deriveStatus(amounts) } });
  }

  async update(id: string, dto: UpdateStudentFeeDto, actor?: AuthUser) {
    const { waive, studentId: _ignored, adjustmentReason, ...changes } = dto;
    if (!adjustmentReason || adjustmentReason.trim().length < 5) throw new BadRequestException("Record a reason for the fee adjustment");
    return this.prisma.$transaction(async (tx) => {
      const fee = await this.lockFee(tx, id);
      const next: Amounts = {
        originalAmount: changes.originalAmount !== undefined ? new Decimal(changes.originalAmount) : fee.originalAmount,
        discount: changes.discount !== undefined ? new Decimal(changes.discount) : fee.discount,
        fine: changes.fine !== undefined ? new Decimal(changes.fine) : fee.fine,
        paid: fee.paid,
        dueDate: changes.dueDate !== undefined ? (toDate(changes.dueDate) ?? null) : fee.dueDate,
      };
      if (payableOf(next).lt(0)) throw new BadRequestException("Discount cannot exceed the fee amount plus fine");
      if (payableOf(next).lt(fee.paid)) throw new BadRequestException("The adjusted fee cannot be less than recorded payments");
      const keepWaived = waive ?? fee.status === PaymentStatus.WAIVED;
      const updated = await tx.studentFee.update({
        where: { id },
        data: { label: changes.label, originalAmount: next.originalAmount, discount: next.discount, fine: next.fine, dueDate: next.dueDate, status: keepWaived ? PaymentStatus.WAIVED : deriveStatus(next) },
      });
      await tx.auditLog.create({ data: { module: "fees", entityId: id, action: "FEE_ADJUSTED", userId: actor?.id, oldValue: { originalAmount: fee.originalAmount.toString(), discount: fee.discount.toString(), fine: fee.fine.toString(), status: fee.status }, newValue: { originalAmount: next.originalAmount.toString(), discount: next.discount.toString(), fine: next.fine.toString(), status: updated.status, reason: adjustmentReason } } });
      return updated;
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockFee(tx, id);
      if (await tx.payment.count({ where: { studentFeeId: id } })) throw new BadRequestException("Fees with payment history must be retained; use a waiver or adjustment");
      await tx.studentFee.delete({ where: { id } });
    });
  }

  // ---- Payments ----

  listPayments(query: PaymentQueryDto) {
    const search = contains(query.search);
    const where: Prisma.PaymentWhereInput = {
      method: query.method,
      paidAt: query.from || query.to ? { gte: query.from ? schoolRange(query.from) : undefined, lte: query.to ? schoolRange(query.to, true) : undefined } : undefined,
      ...(search ? { OR: [{ receiptNumber: search }, { studentFee: { student: { firstName: search } } }, { studentFee: { student: { lastName: search } } }] } : {}),
    };
    return paginated(
      query,
      this.prisma.payment.findMany({ where, include: { studentFee: { select: { id: true, label: true, student: STUDENT_SELECT } } }, orderBy: { paidAt: "desc" }, ...pageArgs(query) }),
      () => this.prisma.payment.count({ where }),
    );
  }

  /** Records a payment. The fee row is locked so concurrent payments cannot overwrite each other's totals. */
  pay(dto: CreatePaymentDto, actor?: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const fee = await this.lockFee(tx, dto.studentFeeId);
      if (fee.status === PaymentStatus.WAIVED) throw new BadRequestException("This fee has been waived");
      const balance = payableOf(fee).minus(fee.paid);
      const amount = new Decimal(dto.amount);
      if (amount.gt(balance)) throw new BadRequestException(`Amount exceeds the outstanding balance of ₹${Decimal.max(balance, 0).toFixed(2)}`);

      const receiptNumber = await this.sequence.next("RCP", tx);
      const payment = await tx.payment.create({ data: { receiptNumber, studentFeeId: fee.id, amount, method: dto.method, notes: dto.notes, paidAt: toDate(dto.paidAt) ?? undefined } });
      const paid = new Decimal(fee.paid).plus(amount);
      await tx.studentFee.update({ where: { id: fee.id }, data: { paid, status: deriveStatus({ ...fee, paid }) } });
      await tx.auditLog.create({ data: { module: "fees", entityId: payment.id, action: "PAYMENT_RECORDED", userId: actor?.id, newValue: { receiptNumber, studentFeeId: fee.id, amount: amount.toString() } } });
      return payment;
    });
  }

  voidPayment(id: string, reason?: string | null, actor?: AuthUser) {
    if (!reason || reason.trim().length < 5) throw new BadRequestException("Record a reason for voiding the payment");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${id} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException("Payment not found");
      if (payment.voided) throw new BadRequestException("Payment is already voided");
      const fee = await this.lockFee(tx, payment.studentFeeId);
      const paid = Decimal.max(0, new Decimal(fee.paid).minus(payment.amount));
      const notes = [payment.notes, `Voided${reason ? `: ${reason}` : ""}`].filter(Boolean).join(" | ");
      const updated = await tx.payment.update({ where: { id }, data: { voided: true, notes } });
      await tx.auditLog.create({ data: { module: "fees", entityId: id, action: "PAYMENT_VOIDED", userId: actor?.id, oldValue: { paid: fee.paid.toString() }, newValue: { paid: paid.toString(), reason: reason ?? null, receiptNumber: payment.receiptNumber } } });
      await tx.studentFee.update({ where: { id: fee.id }, data: { paid, status: fee.status === PaymentStatus.WAIVED ? PaymentStatus.WAIVED : deriveStatus({ ...fee, paid }) } });
      return updated;
    });
  }

  /** Nightly job: flags unpaid fees whose due date has passed. */
  markOverdue() {
    return this.prisma.studentFee.updateMany({ where: { status: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }, dueDate: { lt: new Date() } }, data: { status: PaymentStatus.OVERDUE } });
  }

  // ---- Fee types and structures ----

  feeTypes() {
    return this.prisma.feeType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { feeStructures: true } } } });
  }

  createFeeType(dto: CreateFeeTypeDto) {
    return this.prisma.feeType.create({ data: dto });
  }

  updateFeeType(id: string, dto: UpdateFeeTypeDto) {
    return this.prisma.feeType.update({ where: { id }, data: dto });
  }

  async removeFeeType(id: string) {
    if (await this.prisma.feeStructure.count({ where: { feeTypeId: id } })) throw new BadRequestException("Fee types with structures must be retained; deactivate the type instead");
    return this.prisma.feeType.delete({ where: { id }, select: { id: true } });
  }

  feeStructures(academicYear?: string) {
    return this.prisma.feeStructure.findMany({ where: { academicYear }, include: { feeType: true }, orderBy: [{ academicYear: "desc" }, { className: "asc" }] });
  }

  createFeeStructure(dto: CreateFeeStructureDto) {
    return this.prisma.feeStructure.create({ data: withDates(dto, ["dueDate"]), include: { feeType: true } });
  }

  updateFeeStructure(id: string, dto: UpdateFeeStructureDto) {
    return this.prisma.feeStructure.update({ where: { id }, data: withDates(dto, ["dueDate"]), include: { feeType: true } });
  }

  async removeFeeStructure(id: string) {
    if (await this.prisma.studentFee.count({ where: { feeStructureId: id } })) throw new BadRequestException("Assigned fee structures must be retained for financial history");
    return this.prisma.feeStructure.delete({ where: { id }, select: { id: true } });
  }

  /** Creates this structure's fee for every active student in its class, skipping students who already have it. */
  async assignStructure(id: string) {
    const structure = await this.prisma.feeStructure.findUnique({ where: { id }, include: { feeType: true } });
    if (!structure) throw new NotFoundException("Fee structure not found");
    const label = `${structure.feeType.name} (${structure.academicYear})`;
    const students = await this.prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE, archivedAt: null, academicYear: { name: structure.academicYear }, classLevel: { name: { equals: structure.className, mode: "insensitive" } }, studentFees: { none: { label } } },
      select: { id: true },
    });
    if (!students.length) return { created: 0, label };
    const amounts = { originalAmount: structure.amount, discount: new Decimal(0), fine: new Decimal(0), paid: new Decimal(0), dueDate: structure.dueDate };
    const status = deriveStatus(amounts);
    const { count } = await this.prisma.studentFee.createMany({
      skipDuplicates: true,
      data: students.map((s) => ({ studentId: s.id, feeStructureId: id, label, originalAmount: structure.amount, dueDate: structure.dueDate, status })),
    });
    return { created: count, label };
  }

  private async lockFee(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "StudentFee" WHERE "id" = ${id} FOR UPDATE`;
    const fee = await tx.studentFee.findUnique({ where: { id } });
    if (!fee) throw new NotFoundException("Fee not found");
    return fee;
  }
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
