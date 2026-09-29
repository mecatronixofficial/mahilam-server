import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SequenceService } from "../prisma/sequence.service";
import { Prisma } from "../generated/prisma/client";
import { PaymentStatus, StudentStatus } from "../generated/prisma/enums";
import { toDate, withDates } from "../common/utils/dates";
import { contains, pageArgs, paginated } from "../common/utils/pagination";
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
} from "./dto/create-fee.dto";

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

  async update(id: string, dto: UpdateStudentFeeDto) {
    const { waive, studentId: _ignored, ...changes } = dto;
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
      const keepWaived = waive ?? fee.status === PaymentStatus.WAIVED;
      return tx.studentFee.update({
        where: { id },
        data: { label: changes.label, originalAmount: next.originalAmount, discount: next.discount, fine: next.fine, dueDate: next.dueDate, status: keepWaived ? PaymentStatus.WAIVED : deriveStatus(next) },
      });
    });
  }

  async remove(id: string) {
    const active = await this.prisma.payment.count({ where: { studentFeeId: id, voided: false } });
    if (active) throw new BadRequestException("Void this fee's payments before deleting it");
    await this.prisma.$transaction([this.prisma.payment.deleteMany({ where: { studentFeeId: id } }), this.prisma.studentFee.delete({ where: { id } })]);
  }

  // ---- Payments ----

  listPayments(query: PaymentQueryDto) {
    const search = contains(query.search);
    const where: Prisma.PaymentWhereInput = {
      method: query.method,
      paidAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? endOfDay(query.to) : undefined } : undefined,
      ...(search ? { OR: [{ receiptNumber: search }, { studentFee: { student: { firstName: search } } }, { studentFee: { student: { lastName: search } } }] } : {}),
    };
    return paginated(
      query,
      this.prisma.payment.findMany({ where, include: { studentFee: { select: { id: true, label: true, student: STUDENT_SELECT } } }, orderBy: { paidAt: "desc" }, ...pageArgs(query) }),
      () => this.prisma.payment.count({ where }),
    );
  }

  /** Records a payment. The fee row is locked so concurrent payments cannot overwrite each other's totals. */
  pay(dto: CreatePaymentDto) {
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
      return payment;
    });
  }

  voidPayment(id: string, reason?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException("Payment not found");
      if (payment.voided) throw new BadRequestException("Payment is already voided");
      const fee = await this.lockFee(tx, payment.studentFeeId);
      const paid = Decimal.max(0, new Decimal(fee.paid).minus(payment.amount));
      const notes = [payment.notes, `Voided${reason ? `: ${reason}` : ""}`].filter(Boolean).join(" | ");
      const updated = await tx.payment.update({ where: { id }, data: { voided: true, notes } });
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

  removeFeeType(id: string) {
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

  removeFeeStructure(id: string) {
    return this.prisma.feeStructure.delete({ where: { id }, select: { id: true } });
  }

  /** Creates this structure's fee for every active student in its class, skipping students who already have it. */
  async assignStructure(id: string) {
    const structure = await this.prisma.feeStructure.findUnique({ where: { id }, include: { feeType: true } });
    if (!structure) throw new NotFoundException("Fee structure not found");
    const label = `${structure.feeType.name} (${structure.academicYear})`;
    const students = await this.prisma.student.findMany({
      where: { status: StudentStatus.ACTIVE, classLevel: { name: { equals: structure.className, mode: "insensitive" } }, studentFees: { none: { label } } },
      select: { id: true },
    });
    if (!students.length) return { created: 0, label };
    const amounts = { originalAmount: structure.amount, discount: new Decimal(0), fine: new Decimal(0), paid: new Decimal(0), dueDate: structure.dueDate };
    const status = deriveStatus(amounts);
    const { count } = await this.prisma.studentFee.createMany({
      data: students.map((s) => ({ studentId: s.id, label, originalAmount: structure.amount, dueDate: structure.dueDate, status })),
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
