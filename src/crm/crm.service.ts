import { privateDocument } from "../common/utils/private-document.js";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { AdmissionStatus, EnquiryStatus, WorkStatus, VisitStatus } from "../generated/prisma/enums.js";
import type { AuthUser } from "../common/decorators/current-user.decorator.js";
import { assertEnquiryAccess, canApprove, enquiryScope, isAdministrator, isCounsellor } from "../common/utils/crm-policy.js";
import { assertStageTransition, assertWorkTransition, canonicalStage } from "../common/utils/crm-workflow.js";
import { schoolDay, schoolDayStart, schoolDayEnd, schoolRange } from "../common/utils/school-time.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import { AdmissionsService } from "../admissions/admissions.service.js";
import { AdmissionSettingsDto, AttendanceBatchDto, CommunicationDto, CrmQueryDto, FollowUpTaskDto, GuardianDto, GuardianLinkDto, SlotDto, TaskDto, TemplateDto, UpdateFollowUpTaskDto, UpdateGuardianRecordDto, UpdateTaskDto, UpdateTemplateDto, UpdateVisitDto, VisitDto } from "./crm.dto.js";
type Tx = Prisma.TransactionClient;
const person = { select: { id: true, name: true } } as const;
const lead = { select: { id: true, enquiryNumber: true, studentName: true, parentName: true } } as const;

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService, private admissions: AdmissionsService) {}
  private range(query: CrmQueryDto) {
    const gte = query.from ? schoolRange(query.from) : undefined, lte = query.to ? schoolRange(query.to, true) : undefined;
    if (gte && lte && gte > lte) throw new BadRequestException("From date must not follow to date");
    return gte || lte ? { gte, lte } : undefined;
  }
  private dueRange(query: CrmQueryDto) {
    const range = this.range(query);
    if (query.view === "TODAY") return { gte: range?.gte && range.gte > schoolDayStart() ? range.gte : schoolDayStart(), lte: range?.lte && range.lte < schoolDayEnd() ? range.lte : schoolDayEnd() };
    if (query.view === "UPCOMING") return { ...range, gt: schoolDayEnd() };
    if (query.view === "OVERDUE") return { ...range, lt: new Date() };
    return range;
  }
  private async enquiry(tx: Tx, id: string, actor: AuthUser, writable = true) {
    await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.enquiry.findUnique({ where: { id } });
    assertEnquiryAccess(row, actor);
    if (writable && row!.archivedAt) throw new BadRequestException("Restore the enquiry before changing it");
    return row!;
  }
  private async assignee(tx: Tx, id: string, actor: AuthUser) {
    if (isCounsellor(actor) && id !== actor.id) throw new ForbiddenException("Only managers can assign work to another staff member");
    if (!await tx.user.findFirst({ where: { id, active: true, role: { in: ["ADMIN", "SUPER_ADMIN", "ADMISSION_MANAGER", "COUNSELLOR", "STAFF", "TEACHER"] } }, select: { id: true } })) throw new BadRequestException("Assigned staff account is unavailable");
  }
  private activity(tx: Tx, enquiryId: string, type: string, summary: string, actor: AuthUser, metadata?: Prisma.InputJsonValue) {
    return tx.enquiryActivity.create({ data: { enquiryId, type, summary, actorId: actor.id, actorName: actor.name, metadata } });
  }
  private audit(tx: Tx, module: string, entityId: string, action: string, actor: AuthUser, data?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { module, entityId, action, userId: actor.id, newValue: data } });
  }
  async note(id: string, notes: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => { await this.enquiry(tx, id, actor); return this.activity(tx, id, "NOTE", notes.trim(), actor); });
  }
  async activities(id: string, query: CrmQueryDto, actor: AuthUser) {
    const row = await this.prisma.enquiry.findUnique({ where: { id } }); assertEnquiryAccess(row, actor);
    const page = { ...query, limit: query.limit ?? 50 };
    return paginated(page, this.prisma.enquiryActivity.findMany({ where: { enquiryId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...pageArgs(page) }), () => this.prisma.enquiryActivity.count({ where: { enquiryId: id } }));
  }
  listFollowUps(query: CrmQueryDto, actor: AuthUser, includeArchived = false) {
    const where: Prisma.FollowUpTaskWhereInput = {
      enquiryId: query.enquiryId, assignedStaffId: isCounsellor(actor) ? actor.id : query.assignedStaffId,
      status: query.status ? this.workStatus(query.status) : query.view ? "PENDING" : undefined,
      dueAt: this.dueRange(query), enquiry: { archivedAt: query.archived === "true" ? { not: null } : query.archived === "false" ? null : includeArchived || query.enquiryId ? undefined : null, academicYearId: query.academicYearId, interestedClass: query.program, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, ...(query.search ? { OR: [{ studentName: contains(query.search) }, { parentName: contains(query.search) }, { enquiryNumber: contains(query.search) }] } : {}), ...enquiryScope(actor) },
    };
    return paginated({ ...query, limit: query.limit ?? 25 }, this.prisma.followUpTask.findMany({ where, include: { enquiry: lead, assignedStaff: person }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], ...pageArgs({ ...query, limit: query.limit ?? 25 }) }), () => this.prisma.followUpTask.count({ where }));
  }
  async saveFollowUp(id: string | null, dto: FollowUpTaskDto | UpdateFollowUpTaskDto, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      if (id) await tx.$queryRaw`SELECT "id" FROM "FollowUpTask" WHERE "id" = ${id} FOR UPDATE`;
      const current = id ? await tx.followUpTask.findUnique({ where: { id } }) : null;
      if (id && !current) throw new NotFoundException("Follow-up not found");
      const enquiryId = dto.enquiryId ?? current?.enquiryId;
      if (!enquiryId) throw new BadRequestException("Enquiry is required");
      if (current && dto.enquiryId && current.enquiryId !== dto.enquiryId) throw new BadRequestException("A follow-up's enquiry cannot be changed");
      await this.enquiry(tx, enquiryId, actor);
      if (current && isCounsellor(actor) && current.assignedStaffId !== actor.id) throw new NotFoundException("Follow-up not found");
      const assignedStaffId = dto.assignedStaffId ?? current?.assignedStaffId;
      if (!assignedStaffId) throw new BadRequestException("Staff is required");
      await this.assignee(tx, assignedStaffId, actor);
      const changes = dto as UpdateFollowUpTaskDto;
      const status = changes.status ?? current?.status ?? "PENDING";
      if (current) { assertWorkTransition(current.status, status); if (current.status !== "PENDING" && !changes.status) throw new BadRequestException("Completed or cancelled follow-ups are retained as history"); }
      if (status === "COMPLETED" && !changes.outcome?.trim()) throw new BadRequestException("Record an outcome before completing a follow-up");
      const data = { enquiryId, assignedStaffId, dueAt: dto.dueAt ? new Date(dto.dueAt) : current!.dueAt, method: dto.method ?? current!.method, priority: dto.priority ?? current?.priority, notes: dto.notes, status, outcome: changes.outcome, completedAt: status === "COMPLETED" ? current?.completedAt ?? new Date() : null };
      const row = id ? await tx.followUpTask.update({ where: { id }, data }) : await tx.followUpTask.create({ data });
      const next = await tx.followUpTask.findFirst({ where: { enquiryId, status: "PENDING" }, orderBy: { dueAt: "asc" }, select: { dueAt: true } });
      await tx.enquiry.update({ where: { id: enquiryId }, data: { nextFollowUpDate: next?.dueAt ?? null } });
      await this.activity(tx, enquiryId, "FOLLOW_UP", id ? `Follow-up ${status.toLowerCase()}` : "Follow-up scheduled", actor, { followUpId: row.id });
      return row;
    });
  }
  private workStatus(value: string): WorkStatus { if (!Object.values(WorkStatus).includes(value as WorkStatus)) throw new BadRequestException("Unknown task status"); return value as WorkStatus; }
  listVisits(query: CrmQueryDto, actor: AuthUser, includeArchived = false) {
    if (query.status && !Object.values(VisitStatus).includes(query.status as VisitStatus)) throw new BadRequestException("Unknown visit status");
    const page = { ...query, limit: query.limit ?? 25 };
    const where: Prisma.SchoolVisitWhereInput = { enquiryId: query.enquiryId, assignedStaffId: isCounsellor(actor) ? actor.id : query.assignedStaffId, status: query.status as VisitStatus | undefined, startAt: this.dueRange(query), enquiry: { archivedAt: query.archived === "true" ? { not: null } : query.archived === "false" ? null : includeArchived || query.enquiryId ? undefined : null, academicYearId: query.academicYearId, interestedClass: query.program, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, ...(query.search ? { OR: [{ studentName: contains(query.search) }, { parentName: contains(query.search) }, { enquiryNumber: contains(query.search) }] } : {}), ...enquiryScope(actor) } };
    return paginated(page, this.prisma.schoolVisit.findMany({ where, include: { enquiry: lead, assignedStaff: person, slot: true }, orderBy: [{ startAt: "asc" }, { id: "asc" }], ...pageArgs(page) }), () => this.prisma.schoolVisit.count({ where }));
  }
  async saveVisit(id: string | null, dto: VisitDto | UpdateVisitDto, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      if (id) await tx.$queryRaw`SELECT "id" FROM "SchoolVisit" WHERE "id" = ${id} FOR UPDATE`;
      const current = id ? await tx.schoolVisit.findUnique({ where: { id } }) : null;
      if (id && !current) throw new NotFoundException("School visit not found");
      const enquiryId = dto.enquiryId ?? current?.enquiryId;
      if (!enquiryId) throw new BadRequestException("Enquiry is required");
      if (current && dto.enquiryId && current.enquiryId !== dto.enquiryId) throw new BadRequestException("A visit's enquiry cannot change");
      const enquiry = await this.enquiry(tx, enquiryId, actor);
      if (current && isCounsellor(actor) && current.assignedStaffId !== actor.id) throw new NotFoundException("School visit not found");
      const assignedStaffId = dto.assignedStaffId ?? current?.assignedStaffId;
      if (!assignedStaffId) throw new BadRequestException("Staff is required");
      await this.assignee(tx, assignedStaffId, actor);
      for (const staff of [...new Set([assignedStaffId, ...(current ? [current.assignedStaffId] : [])])].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"visit:" + staff}, 0))`;
      const status = (dto as UpdateVisitDto).status ?? current?.status ?? "SCHEDULED";
      if (current && current.status !== "SCHEDULED") throw new BadRequestException("Completed, cancelled and no-show visits are retained as history");
      let startAt = dto.startAt ? new Date(dto.startAt) : current!.startAt, endAt = dto.endAt ? new Date(dto.endAt) : current!.endAt;
      const slotId = dto.slotId === undefined ? current?.slotId : dto.slotId;
      if (slotId) {
        await tx.$queryRaw`SELECT "id" FROM "VisitSlot" WHERE "id" = ${slotId} FOR UPDATE`;
        const slot = await tx.visitSlot.findUnique({ where: { id: slotId } });
        if (!slot?.active && status === "SCHEDULED") throw new BadRequestException("Visit slot is not available");
        if (!slot) throw new BadRequestException("Visit slot not found");
        startAt = slot.startAt; endAt = slot.endAt;
        if (status === "SCHEDULED" && await tx.schoolVisit.count({ where: { slotId, status: "SCHEDULED", ...(id ? { id: { not: id } } : {}) } }) >= slot.capacity) throw new BadRequestException("Visit slot capacity is full");
      } else if (status === "SCHEDULED" && await tx.visitSlot.count({ where: { active: true } })) throw new BadRequestException("Select one of the school's configured visit slots");
      if (startAt >= endAt) throw new BadRequestException("Visit end must be after its start");
      if (status === "SCHEDULED" && await tx.schoolVisit.count({ where: { assignedStaffId, status: "SCHEDULED", startAt: { lt: endAt }, endAt: { gt: startAt }, ...(id ? { id: { not: id } } : {}) } })) throw new BadRequestException("The assigned staff member already has a visit at this time");
      if (!id && !["CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED"].includes(canonicalStage(enquiry.status))) throw new BadRequestException("Contact or qualify the enquiry before scheduling a visit");
      const data = { enquiryId, assignedStaffId, slotId, startAt, endAt, status, feedback: dto.feedback };
      const row = id ? await tx.schoolVisit.update({ where: { id }, data }) : await tx.schoolVisit.create({ data });
      const stage = status === "COMPLETED" ? "VISIT_COMPLETED" : status === "SCHEDULED" ? "VISIT_SCHEDULED" : undefined;
      if (stage && ["CONTACTED", "QUALIFIED", "VISIT_SCHEDULED", "VISIT_COMPLETED"].includes(canonicalStage(enquiry.status))) await tx.enquiry.update({ where: { id: enquiryId }, data: { status: stage } });
      if (["CANCELLED", "NO_SHOW"].includes(status) && canonicalStage(enquiry.status) === "VISIT_SCHEDULED" && !await tx.schoolVisit.count({ where: { enquiryId, status: "SCHEDULED" } })) await tx.enquiry.update({ where: { id: enquiryId }, data: { status: "CONTACTED" } });
      await this.activity(tx, enquiryId, "VISIT", id ? `School visit ${status.toLowerCase()}` : "School visit scheduled", actor, { visitId: row.id });
      return row;
    });
  }
  slots(query: CrmQueryDto) { return this.prisma.visitSlot.findMany({ where: { active: true, startAt: this.range(query) ?? { gte: new Date() } }, include: { _count: { select: { visits: { where: { status: "SCHEDULED" } } } } }, orderBy: { startAt: "asc" }, take: 200 }); }
  async saveSlot(dto: SlotDto) {
    if (new Date(dto.startAt) >= new Date(dto.endAt)) throw new BadRequestException("Slot end must follow its start");
    return this.prisma.$transaction(async tx => {
      const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('visit-slot-configuration', 0))`;
      await tx.$queryRaw`SELECT "id" FROM "VisitSlot" WHERE "startAt" = ${startAt} FOR UPDATE`;
      const current = await tx.visitSlot.findUnique({ where: { startAt } });
      const booked = current ? await tx.schoolVisit.count({ where: { slotId: current.id, status: "SCHEDULED" } }) : 0;
      if (booked > dto.capacity) throw new BadRequestException("Slot capacity cannot be less than its scheduled bookings");
      if (booked && current!.endAt.valueOf() !== endAt.valueOf()) throw new BadRequestException("Reschedule existing bookings before changing slot times");
      return tx.visitSlot.upsert({ where: { startAt }, create: { ...dto, startAt, endAt }, update: { endAt, capacity: dto.capacity, active: dto.active } });
    });
  }
  private taskScope(query: CrmQueryDto, actor: AuthUser): Prisma.CrmTaskWhereInput {
    const enquiry = { academicYearId: query.academicYearId, interestedClass: query.program, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, assignedStaffId: query.assignedStaffId, ...enquiryScope(actor) };
    const context = Boolean(query.academicYearId || query.program || query.source);
    return {
      assignedStaffId: isCounsellor(actor) ? actor.id : query.assignedStaffId,
      AND: [
        ...(isCounsellor(actor) ? [{ OR: [{ enquiryId: null }, { enquiry: enquiryScope(actor) }] }] : []),
        ...(context ? [{ OR: [
          { enquiry },
          { admission: { academicYearId: query.academicYearId, className: query.program, ...(query.source || query.assignedStaffId || isCounsellor(actor) ? { enquiry } : {}) } },
          ...(!query.source ? [{ student: { academicYearId: query.academicYearId, ...(query.program ? { classLevel: { name: query.program } } : {}) } }] : []),
          { visit: { enquiry } },
        ] }] : []),
      ],
    };
  }
  listTasks(query: CrmQueryDto, actor: AuthUser) {
    const search = contains(query.search), page = { ...query, limit: query.limit ?? 25 };
    const where: Prisma.CrmTaskWhereInput = { ...this.taskScope(query, actor), enquiryId: query.enquiryId, studentId: query.studentId, status: query.status ? this.workStatus(query.status) : query.view ? "PENDING" : undefined, dueAt: this.dueRange(query), ...(search ? { title: search } : {}) };
    return paginated(page, this.prisma.crmTask.findMany({ where, include: { assignedStaff: person, enquiry: lead }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], ...pageArgs(page) }), () => this.prisma.crmTask.count({ where }));
  }
  async saveTask(id: string | null, dto: TaskDto | UpdateTaskDto, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      if (id) await tx.$queryRaw`SELECT "id" FROM "CrmTask" WHERE "id" = ${id} FOR UPDATE`;
      const current = id ? await tx.crmTask.findUnique({ where: { id } }) : null;
      if (id && (!current || isCounsellor(actor) && current.assignedStaffId !== actor.id)) throw new NotFoundException("Task not found");
      if (current && current.status !== "PENDING") throw new BadRequestException("Completed or cancelled tasks are retained as history");
      const assignedStaffId = dto.assignedStaffId ?? current?.assignedStaffId;
      if (!assignedStaffId) throw new BadRequestException("Staff is required");
      await this.assignee(tx, assignedStaffId, actor);
      const links = { enquiryId: dto.enquiryId === undefined ? current?.enquiryId : dto.enquiryId, studentId: dto.studentId === undefined ? current?.studentId : dto.studentId, admissionId: dto.admissionId === undefined ? current?.admissionId : dto.admissionId, visitId: dto.visitId === undefined ? current?.visitId : dto.visitId };
      if (links.enquiryId) await this.enquiry(tx, links.enquiryId, actor);
      if (links.admissionId) {
        const app = await tx.admission.findUnique({ where: { id: links.admissionId }, include: { enquiry: true } });
        if (!app || app.archivedAt) throw new BadRequestException("Application is not available");
        if (isCounsellor(actor)) assertEnquiryAccess(app.enquiry, actor);
      }
      if (links.visitId) { const visit = await tx.schoolVisit.findUnique({ where: { id: links.visitId }, include: { enquiry: true } }); if (!visit) throw new BadRequestException("Visit not found"); assertEnquiryAccess(visit.enquiry, actor); }
      if (links.studentId) { if (isCounsellor(actor)) throw new ForbiddenException("Counsellors cannot access student records"); if (!await tx.student.findFirst({ where: { id: links.studentId, archivedAt: null } })) throw new BadRequestException("Student not available"); }
      const status = (dto as UpdateTaskDto).status ?? current?.status ?? "PENDING";
      if (current) assertWorkTransition(current.status, status);
      const data = { ...links, title: dto.title ?? current!.title, assignedStaffId, dueAt: dto.dueAt ? new Date(dto.dueAt) : current!.dueAt, priority: dto.priority ?? current?.priority, notes: dto.notes, status, completedAt: status === "COMPLETED" ? new Date() : null };
      const row = id ? await tx.crmTask.update({ where: { id }, data }) : await tx.crmTask.create({ data });
      if (links.enquiryId) await this.activity(tx, links.enquiryId, "TASK", `Task ${id ? status.toLowerCase() : "created"}: ${row.title}`, actor);
      await this.audit(tx, "tasks", row.id, id ? "TASK_UPDATED" : "TASK_CREATED", actor);
      return row;
    });
  }
  listGuardians(query: CrmQueryDto) {
    const search = contains(query.search), page = { ...query, limit: query.limit ?? 25 };
    const where: Prisma.GuardianWhereInput = { archivedAt: null, ...(search ? { OR: [{ name: search }, { mobile: search }, { email: search }] } : {}) };
    return paginated(page, this.prisma.guardian.findMany({ where, include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } } }, orderBy: [{ name: "asc" }, { id: "asc" }], ...pageArgs(page) }), () => this.prisma.guardian.count({ where }));
  }
  async guardian(id: string) { const row = await this.prisma.guardian.findUnique({ where: { id }, include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } } } }); if (!row) throw new NotFoundException("Guardian not found"); return row; }
  async saveGuardian(id: string | null, dto: GuardianDto | UpdateGuardianRecordDto, actor: AuthUser) {
    const { consent, ...input } = dto;
    return this.prisma.$transaction(async tx => {
      const data = { ...input, ...(consent === undefined ? {} : { consentAt: consent ? new Date() : null }) };
      const row = id ? await tx.guardian.update({ where: { id }, data }) : await tx.guardian.create({ data: { ...data, name: dto.name!, relationship: dto.relationship!, mobile: dto.mobile! } });
      await this.audit(tx, "guardians", row.id, id ? "GUARDIAN_UPDATED" : "GUARDIAN_CREATED", actor);
      return row;
    });
  }
  async linkGuardian(id: string, dto: GuardianLinkDto, actor: AuthUser, unlink = false) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${dto.studentId} FOR UPDATE`;
      if (!await tx.student.findFirst({ where: { id: dto.studentId, archivedAt: null } })) throw new BadRequestException("Student is not available");
      if (!await tx.guardian.findFirst({ where: { id, archivedAt: null } })) throw new BadRequestException("Guardian is not available");
      if (unlink) await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId: dto.studentId, guardianId: id } } });
      else {
        if (dto.primary) await tx.studentGuardian.updateMany({ where: { studentId: dto.studentId }, data: { primary: false } });
        await tx.studentGuardian.upsert({ where: { studentId_guardianId: { studentId: dto.studentId, guardianId: id } }, create: { studentId: dto.studentId, guardianId: id, primary: dto.primary ?? false }, update: { primary: dto.primary } });
      }
      await this.audit(tx, "guardians", id, unlink ? "GUARDIAN_UNLINKED" : "GUARDIAN_LINKED", actor, { studentId: dto.studentId, primary: dto.primary ?? false });
      return { linked: !unlink };
    });
  }
  async archiveGuardian(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      if (await tx.studentGuardian.count({ where: { guardianId: id } })) throw new BadRequestException("Unlink this guardian from students before archiving");
      const row = await tx.guardian.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit(tx, "guardians", id, "GUARDIAN_ARCHIVED", actor); return row;
    });
  }
  attendance(query: CrmQueryDto) {
    const page = { ...query, limit: query.limit ?? 50 };
    const where: Prisma.AttendanceRecordWhereInput = { studentId: query.studentId, day: query.from || query.to ? { gte: query.from ? new Date(query.from.slice(0, 10)) : undefined, lte: query.to ? new Date(query.to.slice(0, 10)) : undefined } : { equals: new Date(schoolDay()) }, student: { classLevelId: query.classLevelId, academicYearId: query.academicYearId, ...(query.program ? { classLevel: { name: query.program } } : {}) } };
    this.range(query);
    return paginated(page, this.prisma.attendanceRecord.findMany({ where, include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, classLevelId: true } } }, orderBy: [{ day: "desc" }, { studentId: "asc" }], ...pageArgs(page) }), () => this.prisma.attendanceRecord.count({ where }));
  }
  async markAttendance(dto: AttendanceBatchDto, actor: AuthUser) {
    const day = new Date(dto.day);
    if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== dto.day || dto.day > schoolDay()) throw new BadRequestException("Choose a valid school date that is not in the future");
    if (new Set(dto.entries.map(e => e.studentId)).size !== dto.entries.length) throw new BadRequestException("A student appears twice in this attendance batch");
    return this.prisma.$transaction(async tx => {
      for (const entry of [...dto.entries].sort((a, b) => a.studentId.localeCompare(b.studentId))) {
        if (!await tx.student.findFirst({ where: { id: entry.studentId, archivedAt: null, status: "ACTIVE" }, select: { id: true } })) throw new BadRequestException("Attendance requires an active student");
        await tx.attendanceRecord.upsert({ where: { studentId_day: { studentId: entry.studentId, day } }, create: { ...entry, day, markedById: actor.id }, update: { status: entry.status, notes: entry.notes, markedById: actor.id } });
      }
      await this.audit(tx, "attendance", dto.day, "ATTENDANCE_SAVED", actor, { count: dto.entries.length });
      return { count: dto.entries.length };
    });
  }
  templates() { return this.prisma.messageTemplate.findMany({ orderBy: { name: "asc" } }); }
  async saveTemplate(id: string | null, dto: TemplateDto | UpdateTemplateDto, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const row = id ? await tx.messageTemplate.update({ where: { id }, data: dto }) : await tx.messageTemplate.create({ data: dto as TemplateDto });
      await this.audit(tx, "communications", row.id, id ? "TEMPLATE_UPDATED" : "TEMPLATE_CREATED", actor); return row;
    });
  }
  async communication(dto: CommunicationDto, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await this.enquiry(tx, dto.enquiryId, actor);
      const row = await tx.communicationLog.create({ data: { ...dto, actorId: actor.id, status: "RECORDED" } });
      await this.activity(tx, dto.enquiryId, "COMMUNICATION", `${dto.channel} communication recorded; delivery not verified`, actor, { communicationId: row.id });
      return row;
    });
  }
  async communications(query: CrmQueryDto, actor: AuthUser) {
    const page = { ...query, limit: query.limit ?? 25 };
    const where: Prisma.CommunicationLogWhereInput = { enquiryId: query.enquiryId, createdAt: this.range(query), enquiry: enquiryScope(actor) };
    return paginated(page, this.prisma.communicationLog.findMany({ where, include: { enquiry: lead }, orderBy: { createdAt: "desc" }, ...pageArgs(page) }), () => this.prisma.communicationLog.count({ where }));
  }
  async settings() {
    const row = await this.prisma.crmSetting.findUnique({ where: { key: "admissions" } });
    return row?.value ?? { requiredDocuments: ["BIRTH_CERTIFICATE", "CHILD_PHOTO"], followUpDefaultDays: 2 };
  }
  async saveSettings(dto: AdmissionSettingsDto, actor: AuthUser) {
    if (dto.numberPattern && (!["{type}", "{year}", "{number}"].every(token => dto.numberPattern!.split(token).length === 2) || /[{}]/.test(dto.numberPattern.replaceAll("{type}", "").replaceAll("{year}", "").replaceAll("{number}", "")))) throw new BadRequestException("Number format must contain {type}, {year} and {number} once each");
    return this.prisma.$transaction(async tx => {
      const row = await tx.crmSetting.upsert({ where: { key: "admissions" }, create: { key: "admissions", value: { ...dto } }, update: { value: { ...dto } } });
      await this.audit(tx, "crm-settings", "admissions", "SETTINGS_UPDATED", actor); return row.value;
    });
  }
  async uploadDocument(id: string, type: string, file: Express.Multer.File, actor: AuthUser) {
    const { bytes, filename, contentType } = privateDocument(file);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${id} FOR UPDATE`;
      const app = await tx.admission.findUnique({ where: { id }, include: { enquiry: true } });
      if (!app) throw new NotFoundException("Application not found");
      if (isCounsellor(actor)) assertEnquiryAccess(app.enquiry, actor);
      if (app.archivedAt || !["DRAFT", "APPLICATION", "DOCUMENT_PENDING", "VERIFICATION", "FEE_PENDING"].includes(app.status)) throw new BadRequestException("Documents can only be changed while the application is a draft");
      if (!app.consentAt) throw new BadRequestException("Record parent privacy consent before uploading private documents");
      if (await tx.applicationDocument.count({ where: { admissionId: id } }) >= 12) throw new BadRequestException("Maximum 12 application documents");
      const row = await tx.applicationDocument.create({ data: { admissionId: id, type, filename, contentType, size: bytes.length, content: new Uint8Array(bytes), uploadedById: actor.id }, select: { id: true, type: true, filename: true, size: true, createdAt: true } });
      await this.audit(tx, "admissions", id, "DOCUMENT_UPLOADED", actor, { documentId: row.id, type });
      if (app.enquiryId) await this.activity(tx, app.enquiryId, "DOCUMENT", "Private application document added", actor, { documentId: row.id, type });
      return row;
    });
  }
  async document(id: string, documentId: string, actor: AuthUser) {
    await this.admissions.detail(id, actor);
    const row = await this.prisma.applicationDocument.findFirst({ where: { id: documentId, admissionId: id } });
    if (!row) throw new NotFoundException("Document not found"); return row;
  }
  async removeDocument(id: string, documentId: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${id} FOR UPDATE`;
      const app = await tx.admission.findUnique({ where: { id }, include: { enquiry: true } });
      if (!app) throw new NotFoundException("Application not found");
      if (isCounsellor(actor)) assertEnquiryAccess(app.enquiry, actor);
      if (app.archivedAt || !["DRAFT", "APPLICATION", "DOCUMENT_PENDING", "VERIFICATION", "FEE_PENDING"].includes(app.status)) throw new BadRequestException("Only draft documents can be removed");
      await tx.applicationDocument.delete({ where: { id: documentId, admissionId: id } });
      await this.audit(tx, "admissions", id, "DRAFT_DOCUMENT_REMOVED", actor, { documentId }); return { id: documentId };
    });
  }

  async attachments(enquiryId: string, actor: AuthUser) {
    assertEnquiryAccess(await this.prisma.enquiry.findUnique({ where: { id: enquiryId } }), actor);
    return this.prisma.enquiryAttachment.findMany({ where: { enquiryId, archivedAt: null }, select: { id: true, filename: true, contentType: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  }
  async uploadAttachment(enquiryId: string, file: Express.Multer.File, actor: AuthUser) {
    const { bytes, filename, contentType } = privateDocument(file);
    return this.prisma.$transaction(async tx => {
      const enquiry = await this.enquiry(tx, enquiryId, actor);
      if (!enquiry.consentAt) throw new BadRequestException("Record parent privacy consent in the enquiry before uploading private attachments");
      if (await tx.enquiryAttachment.count({ where: { enquiryId, archivedAt: null } }) >= 20) throw new BadRequestException("Maximum 20 current enquiry attachments");
      const row = await tx.enquiryAttachment.create({ data: { enquiryId, filename, contentType, size: bytes.length, content: new Uint8Array(bytes), uploadedById: actor.id }, select: { id: true, filename: true, contentType: true, size: true, createdAt: true } });
      await this.activity(tx, enquiryId, "ATTACHMENT", "Private enquiry attachment added", actor, { attachmentId: row.id });
      return row;
    });
  }
  async attachment(enquiryId: string, attachmentId: string, actor: AuthUser) {
    assertEnquiryAccess(await this.prisma.enquiry.findUnique({ where: { id: enquiryId } }), actor);
    const row = await this.prisma.enquiryAttachment.findFirst({ where: { id: attachmentId, enquiryId, archivedAt: null } });
    if (!row) throw new NotFoundException("Attachment not found");
    return row;
  }
  async archiveAttachment(enquiryId: string, attachmentId: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      await this.enquiry(tx, enquiryId, actor);
      const row = await tx.enquiryAttachment.update({ where: { id: attachmentId, enquiryId }, data: { archivedAt: new Date() }, select: { id: true } });
      await this.activity(tx, enquiryId, "ATTACHMENT_ARCHIVED", "Private enquiry attachment archived", actor, { attachmentId });
      return row;
    });
  }
  async dashboard(query: CrmQueryDto, actor: AuthUser) {
    const createdAt = this.range(query);
    const where: Prisma.EnquiryWhereInput = { archivedAt: null, purpose: "ADMISSION", academicYearId: query.academicYearId, assignedStaffId: query.assignedStaffId, interestedClass: query.program, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, createdAt, ...enquiryScope(actor) };
    const related = { archivedAt: null, academicYearId: query.academicYearId, interestedClass: query.program, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, assignedStaffId: query.assignedStaffId, ...enquiryScope(actor) };
    const due = { enquiry: related, assignedStaffId: isCounsellor(actor) ? actor.id : query.assignedStaffId };
    const appWhere: Prisma.AdmissionWhereInput = { archivedAt: null, academicYearId: query.academicYearId, className: query.program, createdAt, ...((isCounsellor(actor) || query.assignedStaffId || query.source) ? { enquiry: related } : {}) };
    const [stages, sources, staffStages, todayEnquiries, pending, overdue, visits, applications, approved, enrolled, students, tasksToday, programs, monthly] = await Promise.all([
      this.prisma.enquiry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.enquiry.groupBy({ by: ["source"], where, _count: { _all: true } }),
      this.prisma.enquiry.groupBy({ by: ["assignedStaffId", "status"], where, _count: { _all: true } }),
      this.prisma.enquiry.count({ where: { AND: [where, { createdAt: { gte: schoolDayStart(), lte: schoolDayEnd() } }] } }),
      this.prisma.followUpTask.count({ where: { ...due, status: "PENDING", dueAt: createdAt } }),
      this.prisma.followUpTask.count({ where: { ...due, status: "PENDING", AND: [{ dueAt: { lt: new Date() } }, ...(createdAt ? [{ dueAt: createdAt }] : [])] } }),
      this.prisma.schoolVisit.count({ where: { ...due, status: "SCHEDULED", startAt: createdAt } }),
      this.prisma.admission.count({ where: { ...appWhere, status: "SUBMITTED" } }),
      this.prisma.admission.count({ where: { ...appWhere, status: "APPROVED" } }),
      this.prisma.admission.count({ where: { ...appWhere, status: { in: ["CONFIRMED", "ENROLLED"] } } }),
      this.prisma.student.count({ where: { archivedAt: null, status: "ACTIVE", academicYearId: query.academicYearId, createdAt, ...((isCounsellor(actor) || query.assignedStaffId || query.source) ? { admission: { enquiry: related } } : {}), ...(query.program ? { classLevel: { name: query.program } } : {}) } }),
      this.prisma.crmTask.count({ where: { ...this.taskScope(query, actor), status: "PENDING", dueAt: this.dueRange({ ...query, view: "TODAY" }) } }),
      this.prisma.admission.groupBy({ by: ["className"], where: appWhere, _count: { _all: true } }),
      this.monthlyEnquiries(query, actor),
    ]);
    const byStage = new Map<string, number>();
    for (const row of stages) byStage.set(canonicalStage(row.status), (byStage.get(canonicalStage(row.status)) ?? 0) + row._count._all);
    const count = (stage: string) => byStage.get(stage) ?? 0;
    const total = [...byStage.values()].reduce((a, b) => a + b, 0);
    const staffIds = [...new Set(staffStages.map(s => s.assignedStaffId).filter((id): id is string => !!id))];
    const users = await this.prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } });
    const counsellors = staffIds.map(id => { const rows = staffStages.filter(s => s.assignedStaffId === id); return { id, name: users.find(u => u.id === id)?.name ?? "Former staff", enquiries: rows.reduce((sum, r) => sum + r._count._all, 0), enrolled: rows.filter(r => canonicalStage(r.status) === "ENROLLED").reduce((sum, r) => sum + r._count._all, 0) }; });
    return {
      metrics: { totalEnquiries: total, newEnquiries: count("NEW_ENQUIRY"), todayEnquiries, contactedLeads: count("CONTACTED"), qualifiedLeads: count("QUALIFIED"), pendingFollowUps: pending, overdueFollowUps: overdue, visitsScheduled: visits, applicationsSubmitted: applications, approvedAdmissions: approved, confirmedEnrollments: enrolled, lostLeads: count("LOST"), totalEnrolledStudents: students, todayTasks: tasksToday },
      monthly, bySource: sources.map(r => ({ name: r.source, count: r._count._all })), byProgram: programs.map(r => ({ name: r.className, count: r._count._all })),
      byStage: [...byStage].map(([name, count]) => ({ name, count })), counsellors,
      conversionRate: total ? Math.round(count("ENROLLED") / total * 1000) / 10 : 0,
      conversionDefinition: "Enrolled enquiries divided by admission enquiries created in the selected cohort; archived enquiries excluded.",
    };
  }
  private async monthlyEnquiries(query: CrmQueryDto, actor: AuthUser) {
    const clauses = [Prisma.sql`"archivedAt" IS NULL AND "purpose" = 'ADMISSION'`];
    if (query.academicYearId) clauses.push(Prisma.sql`"academicYearId" = ${query.academicYearId}`);
    const assignee = isCounsellor(actor) ? actor.id : query.assignedStaffId;
    if (assignee) clauses.push(Prisma.sql`"assignedStaffId" = ${assignee}`);
    if (query.source) clauses.push(Prisma.sql`"source"::text = ${query.source}`);
    if (query.program) clauses.push(Prisma.sql`"interestedClass" = ${query.program}`);
    if (query.from) clauses.push(Prisma.sql`"createdAt" >= ${schoolRange(query.from)}`);
    if (query.to) clauses.push(Prisma.sql`"createdAt" <= ${schoolRange(query.to, true)}`);
    if (!query.from) clauses.push(Prisma.sql`"createdAt" >= ${new Date(Date.now() - 366 * 86400_000)}`);
    return this.prisma.$queryRaw<{ month: string; count: number }[]>(Prisma.sql`SELECT to_char(date_trunc('month', "createdAt" + INTERVAL '5 hours 30 minutes'), 'YYYY-MM') AS month, count(*)::int AS count FROM "Enquiry" WHERE ${Prisma.join(clauses, " AND ")} GROUP BY 1 ORDER BY 1`);
  }
  private admissionStatus(status: string): Prisma.EnumAdmissionStatusFilter {
    if (!Object.values(AdmissionStatus).includes(status as AdmissionStatus)) throw new BadRequestException("Unknown application status");
    return { in: (status === "ENROLLED" || status === "CONFIRMED" ? ["ENROLLED", "CONFIRMED"] : [status]) as import("../generated/prisma/enums.js").AdmissionStatus[] };
  }
  async report(kind: string, query: CrmQueryDto, actor: AuthUser) {
    if (isCounsellor(actor) && !["enquiries", "lost", "follow-ups", "visits", "admissions", "sources", "counsellors", "conversion"].includes(kind)) throw new ForbiddenException("This report requires school record access");
    if (actor.role === "TEACHER" && kind !== "attendance") throw new ForbiddenException("Teachers can view attendance reports only");
    if (actor.role === "ACCOUNTANT" && !["fees", "payments", "outstanding", "students", "academic-years"].includes(kind)) throw new ForbiddenException("This report requires admissions access");
    const page = { ...query, limit: query.limit ?? 25 }, createdAt = this.range(query);
    const enquiryWhere: Prisma.EnquiryWhereInput = { purpose: query.purpose, ...(query.archived === undefined ? {} : { archivedAt: query.archived === "true" ? { not: null } : null }), ...(query.search ? { OR: [{ studentName: contains(query.search) }, { parentName: contains(query.search) }, { phone: contains(query.search) }, { enquiryNumber: contains(query.search) }] } : {}), ...(query.followUpDue === "true" ? { nextFollowUpDate: { lte: schoolDayEnd() } } : {}), academicYearId: query.academicYearId, interestedClass: query.program, assignedStaffId: query.assignedStaffId, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, createdAt, ...enquiryScope(actor) };
    if (kind === "follow-ups") return this.listFollowUps(query, actor, true);
    if (kind === "visits") return this.listVisits(query, actor, true);
    if (kind === "attendance") return this.attendance(query);
    if (kind === "enquiries" || kind === "lost") {
      if (query.status && !Object.values(EnquiryStatus).includes(query.status as EnquiryStatus)) throw new BadRequestException("Unknown stage");
      const where: Prisma.EnquiryWhereInput = { ...enquiryWhere, status: kind === "lost" ? { in: ["LOST", "NOT_INTERESTED", "CLOSED"] } : query.status ? { in: Object.values(EnquiryStatus).filter(status => canonicalStage(status) === canonicalStage(query.status!)) } : query.openOnly === "true" || query.followUpDue === "true" ? { notIn: ["ENROLLED", "ADMISSION_CONFIRMED", "LOST", "NOT_INTERESTED", "CLOSED", "REJECTED"] } : undefined };
      return paginated(page, this.prisma.enquiry.findMany({ where, select: { id: true, enquiryNumber: true, parentName: true, studentName: true, phone: true, email: true, interestedClass: true, source: true, status: true, lostReason: true, archivedAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...pageArgs(page) }), () => this.prisma.enquiry.count({ where }));
    }
    if (kind === "students") {
      if (isCounsellor(actor)) throw new ForbiddenException("Student exports require school record access");
      const where: Prisma.StudentWhereInput = { academicYearId: query.academicYearId, classLevelId: query.classLevelId, ...(query.program ? { classLevel: { name: query.program } } : {}), createdAt };
      return paginated(page, this.prisma.student.findMany({ where, select: { id: true, admissionNumber: true, firstName: true, lastName: true, status: true, academicYear: { select: { name: true } }, classLevel: { select: { name: true } }, archivedAt: true }, orderBy: { createdAt: "desc" }, ...pageArgs(page) }), () => this.prisma.student.count({ where }));
    }
    if (kind === "admissions") {
      const where: Prisma.AdmissionWhereInput = { academicYearId: query.academicYearId, className: query.program, createdAt,
        ...(query.archived === undefined ? {} : { archivedAt: query.archived === "true" ? { not: null } : null }),
        ...(query.status ? { status: this.admissionStatus(query.status) } : {}),
        ...((isCounsellor(actor) || query.assignedStaffId || query.source) ? { enquiry: { assignedStaffId: query.assignedStaffId, source: query.source as Prisma.EnumEnquirySourceFilter | undefined, ...enquiryScope(actor) } } : {}) };
      return paginated(page, this.prisma.admission.findMany({ where, select: { id: true, applicationNumber: true, studentName: true, className: true, status: true, admissionNumber: true, archivedAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, ...pageArgs(page) }), () => this.prisma.admission.count({ where }));
    }
    if (kind === "sources" || kind === "counsellors" || kind === "conversion" || kind === "academic-years") {
      const d = await this.dashboard(query, actor);
      const data = kind === "sources" ? d.bySource : kind === "counsellors" ? d.counsellors : kind === "conversion" ? [{ name: "Enquiry to enrollment", enquiries: d.metrics.totalEnquiries, enrolled: d.byStage.find(row => row.name === "ENROLLED")?.count ?? 0, conversionRate: d.conversionRate }] : await this.prisma.academicYear.findMany({ where: query.academicYearId ? { id: query.academicYearId } : {}, select: { id: true, name: true, active: true, current: true, _count: { select: {
          students: { where: { createdAt, ...(query.program ? { classLevel: { name: query.program } } : {}) } },
          enquiries: { where: { createdAt, interestedClass: query.program } },
          admissions: { where: { createdAt, className: query.program } },
        } } } });
      return { success: true, data };
    }
    if (kind === "payments") {
      if (!isAdministrator(actor) && actor.role !== "ACCOUNTANT") throw new ForbiddenException("Financial reports require accounting access");
      const where: Prisma.PaymentWhereInput = { voided: false, paidAt: createdAt, studentFee: { student: { academicYearId: query.academicYearId, classLevelId: query.classLevelId, ...(query.program ? { classLevel: { name: query.program } } : {}) } } };
      return paginated(page, this.prisma.payment.findMany({ where, select: { id: true, receiptNumber: true, amount: true, method: true, paidAt: true, studentFee: { select: { label: true, student: { select: { firstName: true, lastName: true, admissionNumber: true } } } } }, orderBy: { paidAt: "desc" }, ...pageArgs(page) }), () => this.prisma.payment.count({ where }));
    }
    if (kind === "fees" || kind === "outstanding") {
      if (!isAdministrator(actor) && actor.role !== "ACCOUNTANT") throw new ForbiddenException("Financial reports require accounting access");
      const where: Prisma.StudentFeeWhereInput = { student: { academicYearId: query.academicYearId, ...(query.program ? { classLevel: { name: query.program } } : {}) }, ...(kind === "outstanding" ? { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } : {}), ...(createdAt ? { dueDate: createdAt } : {}) };
      return paginated(page, this.prisma.studentFee.findMany({ where, include: { student: { select: { admissionNumber: true, firstName: true, lastName: true } }, payments: { where: { voided: false }, select: { receiptNumber: true, amount: true, paidAt: true } } }, orderBy: { dueDate: "asc" }, ...pageArgs(page) }), () => this.prisma.studentFee.count({ where }));
    }
    throw new BadRequestException("Unknown CRM report");
  }
}
