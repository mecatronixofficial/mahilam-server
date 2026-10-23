import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SequenceService } from "../prisma/sequence.service.js";
import { NotificationsService } from "../integrations/notifications.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { EnquiryStatus } from "../generated/prisma/enums.js";
import { toDate, withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import type { AuthUser } from "../common/decorators/current-user.decorator.js";
import { assertEnquiryAccess, canApprove, enquiryScope, isCounsellor } from "../common/utils/crm-policy.js";
import { assertStageTransition, canonicalStage, normalizedPhone } from "../common/utils/crm-workflow.js";
import { schoolDayEnd, schoolRange } from "../common/utils/school-time.js";
import { CreateEnquiryDto, CreateFollowUpDto, CreateInternalEnquiryDto, EnquiryQueryDto, UpdateEnquiryDto } from "./dto/create-enquiry.dto.js";
const DATE_FIELDS = ["studentDob", "nextFollowUpDate", "preferredVisitAt"];
const terminal = ["ADMISSION_CONFIRMED", "ENROLLED", "NOT_INTERESTED", "CLOSED", "LOST", "REJECTED"] as EnquiryStatus[];
type Tx = Prisma.TransactionClient;

@Injectable()
export class EnquiriesService {
  constructor(private prisma: PrismaService, private sequence: SequenceService, private notifications: NotificationsService) {}
  async create(dto: CreateEnquiryDto) {
    const { consent, source: _source, ...input } = dto;
    const yearId = await this.activeYear(input.academicYearId);
    const phone = normalizedPhone(dto.phone);
    const enquiry = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone + "|" + dto.studentName.trim().toLowerCase() + "|" + (yearId ?? "")}, 0))`;
      const repeated = await tx.enquiry.findFirst({ where: { normalizedPhone: phone, studentName: { equals: dto.studentName.trim(), mode: "insensitive" }, academicYearId: yearId, purpose: input.purpose ?? "ADMISSION", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true, enquiryNumber: true } });
      if (repeated) return repeated;
      const row = await tx.enquiry.create({ data: { ...withDates(input, DATE_FIELDS), academicYearId: yearId, source: "WEBSITE", status: EnquiryStatus.NEW_ENQUIRY, normalizedPhone: phone, consentAt: consent ? new Date() : null, enquiryNumber: await this.sequence.next("ENQ", tx) } });
      await this.activity(tx, row.id, "CREATED", "Website enquiry received");
      return row;
    });
    if ("parentName" in enquiry) void this.notifications.sendNewEnquiry({ ...dto, enquiryNumber: enquiry.enquiryNumber });
    return { id: enquiry.id, enquiryNumber: enquiry.enquiryNumber };
  }
  async createInternal(dto: CreateInternalEnquiryDto, actor?: AuthUser) {
    this.assertStatus(dto.status);
    const { consent, allowDuplicate, duplicateReason, ...input } = dto;
    const assignedStaffId = actor && isCounsellor(actor) ? actor.id : input.assignedStaffId;
    await this.assertAssignee(assignedStaffId);
    const academicYearId = await this.activeYear(input.academicYearId);
    const phone = normalizedPhone(dto.phone);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${phone + "|" + dto.studentName.trim().toLowerCase() + "|" + (academicYearId ?? "")}, 0))`;
      const duplicate = await tx.enquiry.findFirst({ where: { normalizedPhone: phone, studentName: { equals: dto.studentName.trim(), mode: "insensitive" }, academicYearId, archivedAt: null }, select: { id: true } });
      if (duplicate && !(allowDuplicate && duplicateReason?.trim())) throw new ConflictException("A likely duplicate exists for this child, phone and academic year. Confirm the legitimate repeat with a reason.");
      const row = await tx.enquiry.create({ data: { ...withDates(input, DATE_FIELDS), normalizedPhone: phone, academicYearId, assignedStaffId, consentAt: consent ? new Date() : null, status: input.status ?? EnquiryStatus.NEW_ENQUIRY, enquiryNumber: await this.sequence.next("ENQ", tx) } });
      await this.activity(tx, row.id, "CREATED", duplicate ? "Legitimate repeat enquiry created" : "Enquiry created", actor, duplicate ? { reason: duplicateReason! } : undefined);
      return row;
    });
  }
  list(query: EnquiryQueryDto, actor?: AuthUser) {
    const search = contains(query.search);
    const from = query.from ? schoolRange(query.from) : undefined, to = query.to ? schoolRange(query.to, true) : undefined;
    if (from && to && from > to) throw new BadRequestException("From date must not follow to date");
    const where: Prisma.EnquiryWhereInput = {
      archivedAt: query.archived === "true" ? { not: null } : null,
      purpose: query.purpose, academicYearId: query.academicYearId, interestedClass: query.interestedClass, source: query.source,
      assignedStaffId: query.assignedStaffId,
      status: query.status ? { in: [...new Set([query.status, ...Object.values(EnquiryStatus).filter(s => canonicalStage(s) === canonicalStage(query.status!))])] } : (query.openOnly === "true" || query.followUpDue === "true") ? { notIn: terminal } : undefined,
      ...(query.followUpDue === "true" ? { nextFollowUpDate: { lte: schoolDayEnd() } } : {}),
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(search ? { OR: [{ parentName: search }, { studentName: search }, { phone: search }, { normalizedPhone: search }, { enquiryNumber: search }, { email: search }, { interestedClass: search }] } : {}),
      ...(actor ? enquiryScope(actor) : {}),
    };
    return paginated(query, this.prisma.enquiry.findMany({ where, orderBy: [{ [query.sort ?? "createdAt"]: query.order ?? "desc" }, { id: "desc" }], include: { assignedStaff: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } } }, ...pageArgs(query) }), () => this.prisma.enquiry.count({ where }));
  }
  async detail(id: string, actor?: AuthUser) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, include: {
      followUps: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 200 },
      scheduledFollowUps: { orderBy: { dueAt: "desc" }, take: 100 },
      visits: { orderBy: { startAt: "desc" }, take: 100 },
      communications: { orderBy: { createdAt: "desc" }, take: 100 },
      admissions: { select: { id: true, applicationNumber: true, status: true, admissionNumber: true, archivedAt: true }, orderBy: { createdAt: "desc" } },
      assignedStaff: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } },
    } });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    if (actor) assertEnquiryAccess(enquiry, actor);
    return enquiry;
  }
  async update(id: string, dto: UpdateEnquiryDto, actor?: AuthUser) {
    this.assertStatus(dto.status);
    const { consent, allowDuplicate: _allow, duplicateReason: _reason, ...input } = dto;
    await this.assertAssignee(dto.assignedStaffId);
    if (dto.academicYearId) await this.activeYear(dto.academicYearId);
    return this.prisma.$transaction(async tx => {
      const current = await this.lockEnquiry(tx, id, actor);
      if (current.archivedAt) throw new BadRequestException("Restore this enquiry before editing");
      if (dto.academicYearId !== undefined && dto.academicYearId !== current.academicYearId && await tx.admission.count({ where: { enquiryId: id, archivedAt: null } })) throw new BadRequestException("An enquiry linked to an active application cannot change academic year");
      if (actor && isCounsellor(actor) && dto.assignedStaffId !== undefined && dto.assignedStaffId !== actor.id) throw new ForbiddenException("Only a manager can reassign enquiries");
      if (dto.status) assertStageTransition(current.status, dto.status, { manager: actor ? canApprove(actor) : false, reason: dto.lostReason });
      const row = await tx.enquiry.update({ where: { id }, data: { ...withDates(input, DATE_FIELDS), ...(dto.phone ? { normalizedPhone: normalizedPhone(dto.phone) } : {}), ...(consent === undefined ? {} : { consentAt: consent ? new Date() : null }) } });
      await this.activity(tx, id, dto.status && dto.status !== current.status ? "STAGE_CHANGED" : dto.assignedStaffId !== undefined ? "ASSIGNED" : "UPDATED", dto.status ? `Stage changed to ${canonicalStage(dto.status)}` : "Enquiry details updated", actor, dto.status ? { from: current.status, to: dto.status, reason: dto.lostReason ?? null } : undefined);
      return row;
    });
  }
  async remove(id: string, actor?: AuthUser) { return this.archive(id, true, actor); }
  async archive(id: string, archived: boolean, actor?: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await this.lockEnquiry(tx, id, actor);
      const row = await tx.enquiry.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.activity(tx, id, archived ? "ARCHIVED" : "RESTORED", archived ? "Enquiry archived; history retained" : "Enquiry restored", actor);
      return row;
    });
  }
  async bulkAssign(ids: string[], assignedStaffId: string, actor: AuthUser) {
    if (!canApprove(actor)) throw new ForbiddenException("Only managers can bulk assign enquiries");
    await this.assertAssignee(assignedStaffId);
    return this.prisma.$transaction(async tx => {
      // Lock in deterministic order to avoid deadlocks between overlapping batches.
      for (const id of [...new Set(ids)].sort()) {
        const row = await this.lockEnquiry(tx, id, actor);
        if (row.archivedAt) throw new BadRequestException("Archived enquiries cannot be assigned");
        await tx.enquiry.update({ where: { id }, data: { assignedStaffId } });
        await this.activity(tx, id, "ASSIGNED", "Counsellor assigned", actor, { assignedStaffId });
      }
      return { count: new Set(ids).size };
    });
  }
  async addFollowUp(id: string, dto: CreateFollowUpDto, staffName: string, actor?: AuthUser) {
    this.assertStatus(dto.status);
    const { status, staffName: _untrusted, ...rest } = dto;
    return this.prisma.$transaction(async tx => {
      const current = await this.lockEnquiry(tx, id, actor);
      if (current.archivedAt) throw new BadRequestException("Archived enquiries cannot be changed");
      const nextStatus = status ?? (["NEW", "NEW_ENQUIRY"].includes(current.status) ? EnquiryStatus.CONTACTED : current.status);
      assertStageTransition(current.status, nextStatus);
      const followUp = await tx.enquiryFollowUp.create({ data: { ...rest, enquiryId: id, nextFollowUp: toDate(dto.nextFollowUp), staffName } });
      await tx.enquiry.update({ where: { id }, data: { ...(dto.nextFollowUp === undefined ? {} : { nextFollowUpDate: toDate(dto.nextFollowUp) ?? null }), status: nextStatus } });
      await this.activity(tx, id, "CONTACT_LOGGED", `${dto.contactMethod} contact recorded`, actor, { followUpId: followUp.id, from: current.status, to: nextStatus });
      return followUp;
    });
  }
  async removeFollowUp(enquiryId: string, followUpId: string, actor?: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await this.lockEnquiry(tx, enquiryId, actor);
      const row = await tx.enquiryFollowUp.update({ where: { id: followUpId, enquiryId }, data: { archivedAt: new Date() }, select: { id: true } });
      await this.activity(tx, enquiryId, "CONTACT_ARCHIVED", "Contact entry archived; history retained", actor);
      return row;
    });
  }
  private async lockEnquiry(tx: Tx, id: string, actor?: AuthUser) {
    await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.enquiry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Enquiry not found");
    if (actor) assertEnquiryAccess(row, actor);
    return row;
  }
  private assertStatus(status?: EnquiryStatus) {
    if (status && ["ADMISSION_CONFIRMED", "ENROLLED", "APPROVED", "APPLICATION_SUBMITTED", "REJECTED"].includes(status)) throw new BadRequestException("Admission confirmation is managed by the admission approval action");
  }
  private async activeYear(id?: string | null) {
    const year = await this.prisma.academicYear.findFirst({ where: id ? { id, active: true } : { current: true, active: true }, select: { id: true } });
    if (id && !year) throw new BadRequestException("Academic year is not active");
    return year?.id ?? null;
  }
  private async assertAssignee(id?: string | null) {
    if (!id) return;
    if (!await this.prisma.user.findFirst({ where: { id, active: true, role: { in: ["ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "STAFF", "COUNSELLOR"] } }, select: { id: true } })) throw new BadRequestException("Assigned staff account is unavailable");
  }
  private activity(tx: Tx, enquiryId: string, type: string, summary: string, actor?: AuthUser, metadata?: Prisma.InputJsonValue) {
    return tx.enquiryActivity.create({ data: { enquiryId, type, summary, actorId: actor?.id, actorName: actor?.name, metadata } });
  }
}
