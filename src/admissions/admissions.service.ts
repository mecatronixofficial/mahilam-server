import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SequenceService } from "../prisma/sequence.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { AdmissionStatus, EnquiryStatus } from "../generated/prisma/enums.js";
import { schoolDay, schoolRange } from "../common/utils/school-time.js";
import { toDate, withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import type { AuthUser } from "../common/decorators/current-user.decorator.js";
import { assertEnquiryAccess, enquiryScope, isCounsellor, requireApprovalRole } from "../common/utils/crm-policy.js";
import { checkEnrollmentCapacity } from "../common/utils/enrollment-capacity.js";
import { AdmissionQueryDto, ConfirmAdmissionDto, CreateAdmissionDto, ReviewAdmissionDto, UpdateAdmissionDto } from "./dto/create-admission.dto.js";
type Tx = Prisma.TransactionClient;
const editable = ["DRAFT", "APPLICATION", "DOCUMENT_PENDING", "VERIFICATION", "FEE_PENDING"];
const dates = ["joiningDate", "childDob"];
const documentSelect = { id: true, type: true, filename: true, contentType: true, size: true, createdAt: true } as const;

@Injectable()
export class AdmissionsService {
  constructor(private prisma: PrismaService, private sequence: SequenceService) {}
  list(query: AdmissionQueryDto, actor?: AuthUser) {
    const search = contains(query.search);
    const from = query.from ? schoolRange(query.from) : undefined, to = query.to ? schoolRange(query.to, true) : undefined;
    if (from && to && from > to) throw new BadRequestException("From date must not follow to date");
    const where: Prisma.AdmissionWhereInput = {
      archivedAt: query.archived === "true" ? { not: null } : null, status: query.status, academicYearId: query.academicYearId, className: query.program, ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
      ...(actor && isCounsellor(actor) ? { enquiry: enquiryScope(actor) } : query.assignedStaffId ? { enquiry: { assignedStaffId: query.assignedStaffId } } : {}),
      ...(search ? { OR: [{ studentName: search }, { applicationNumber: search }, { admissionNumber: search }, { className: search }] } : {}),
    };
    return paginated(query, this.prisma.admission.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { academicYear: { select: { id: true, name: true } }, classLevel: { select: { id: true, name: true } } }, ...pageArgs(query) }), () => this.prisma.admission.count({ where }));
  }
  async detail(id: string, actor?: AuthUser) {
    const row = await this.prisma.admission.findUnique({ where: { id }, include: { enquiry: true, documents: { select: documentSelect }, academicYear: true, classLevel: { include: { sections: true } } } });
    if (!row) throw new NotFoundException("Admission not found");
    if (actor && isCounsellor(actor)) assertEnquiryAccess(row.enquiry, actor);
    const history = await this.prisma.auditLog.findMany({ where: { module: "admissions", entityId: id }, select: { id: true, action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return { ...row, history };
  }
  async create(dto: CreateAdmissionDto, actor?: AuthUser) {
    this.assertOrdinaryStatus(dto.status);
    const { consent, ...input } = dto;
    return this.prisma.$transaction(async tx => {
      const enquiry = dto.enquiryId ? await this.lockEnquiry(tx, dto.enquiryId, undefined, actor) : null;
      if (actor && isCounsellor(actor) && !enquiry) throw new BadRequestException("A counsellor must link an assigned enquiry");
      const year = await tx.academicYear.findFirst({ where: dto.academicYearId || enquiry?.academicYearId ? { id: dto.academicYearId ?? enquiry?.academicYearId!, active: true } : { current: true, active: true } });
      if ((dto.academicYearId || enquiry?.academicYearId) && !year) throw new BadRequestException("Academic year is not active");
      if (enquiry?.academicYearId && year?.id !== enquiry.academicYearId) throw new BadRequestException("Application and enquiry academic years must match");
      const level = dto.classLevelId ? await tx.classLevel.findFirst({ where: { id: dto.classLevelId, active: true, academicYearId: year?.id } }) : null;
      if (dto.classLevelId && !level) throw new BadRequestException("Class must belong to the selected active academic year");
      const settings = await tx.crmSetting.findUnique({ where: { key: "admissions" } });
      const configured = settings?.value as { requiredDocuments?: string[] } | undefined;
      const row = await tx.admission.create({ data: {
        ...withDates(input, dates), academicYearId: year?.id, className: level?.name ?? input.className,
        childDob: toDate(input.childDob) ?? enquiry?.studentDob, parentName: input.parentName ?? enquiry?.parentName,
        phone: input.phone ?? enquiry?.phone, email: input.email ?? enquiry?.email,
        consentAt: consent ? new Date() : null, status: dto.status ?? AdmissionStatus.DRAFT,
        requiredDocuments: configured?.requiredDocuments ?? ["BIRTH_CERTIFICATE", "CHILD_PHOTO"],
        applicationNumber: await this.sequence.next("ADM", tx),
      } });
      if (enquiry) await this.stage(tx, enquiry.id, EnquiryStatus.APPLICATION_STARTED, "Application started", actor, { applicationId: row.id });
      return row;
    });
  }
  async update(id: string, dto: UpdateAdmissionDto, actor?: AuthUser) {
    this.assertOrdinaryStatus(dto.status);
    const { consent, ...input } = dto;
    return this.prisma.$transaction(async tx => {
      const row = await this.lockAdmission(tx, id, actor);
      if (row.archivedAt || !editable.includes(row.status)) throw new ConflictException("Only a draft application can be edited; enrolled applications must be retained");
      if (dto.enquiryId !== undefined && dto.enquiryId !== row.enquiryId) throw new BadRequestException("An application's linked enquiry cannot be changed");
      const academicYearId = dto.academicYearId ?? row.academicYearId;
      if (row.enquiryId) {
        const enquiry = await tx.enquiry.findUnique({ where: { id: row.enquiryId }, select: { academicYearId: true } });
        if (enquiry?.academicYearId && academicYearId !== enquiry.academicYearId) throw new BadRequestException("Application and enquiry academic years must match");
      }
      if (academicYearId && !await tx.academicYear.findFirst({ where: { id: academicYearId, active: true } })) throw new BadRequestException("Academic year is not active");
      const classLevelId = dto.classLevelId === undefined ? row.classLevelId : dto.classLevelId;
      const level = classLevelId ? await tx.classLevel.findFirst({ where: { id: classLevelId, active: true, academicYearId } }) : null;
      if (classLevelId && !level) throw new BadRequestException("Class does not belong to this academic year");
      const updated = await tx.admission.update({ where: { id }, data: { ...withDates(input, dates), ...(level ? { className: level.name } : {}), ...(consent === undefined ? {} : { consentAt: consent ? new Date() : null }) } });
      await this.audit(tx, id, "APPLICATION_UPDATED", actor);
      return updated;
    });
  }
  async submit(id: string, actor: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const row = await this.lockAdmission(tx, id, actor);
      if (row.archivedAt || !editable.includes(row.status)) throw new BadRequestException("Only draft applications can be submitted");
      await this.validateApplication(tx, row);
      const result = await tx.admission.update({ where: { id }, data: { status: AdmissionStatus.SUBMITTED, submittedAt: new Date() } });
      if (row.enquiryId) await this.stage(tx, row.enquiryId, EnquiryStatus.APPLICATION_SUBMITTED, "Application submitted for review", actor);
      await this.audit(tx, id, "APPLICATION_SUBMITTED", actor);
      return result;
    });
  }
  async review(id: string, dto: ReviewAdmissionDto, actor: AuthUser) {
    requireApprovalRole(actor);
    if (dto.decision !== "APPROVED" && !dto.reason?.trim()) throw new BadRequestException("A decision reason is required");
    return this.prisma.$transaction(async tx => {
      const row = await this.lockAdmission(tx, id, actor);
      if (row.archivedAt || !["SUBMITTED", "WAITLISTED", "APPROVED"].includes(row.status)) throw new BadRequestException("Submit the application before reviewing it");
      if (dto.decision === "APPROVED") await this.validateApplication(tx, row);
      const updated = await tx.admission.update({ where: { id }, data: { status: dto.decision, reviewedAt: new Date(), reviewedById: actor.id, decisionReason: dto.reason } });
      if (row.enquiryId) await this.stage(tx, row.enquiryId, dto.decision as EnquiryStatus, `Application ${dto.decision.toLowerCase()}`, actor);
      await this.audit(tx, id, `ADMISSION_${dto.decision}`, actor, { reason: dto.reason ?? null });
      return updated;
    });
  }
  async remove(id: string, actor?: AuthUser) {
    return this.prisma.$transaction(async tx => {
      const row = await this.lockAdmission(tx, id, actor);
      if (row.admissionNumber || ["CONFIRMED", "ENROLLED"].includes(row.status)) throw new ConflictException("Enrolled applications must be retained");
      const result = await tx.admission.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit(tx, id, "APPLICATION_ARCHIVED", actor);
      return result;
    });
  }
  async confirm(id: string, dto: ConfirmAdmissionDto, actor: AuthUser) {
    requireApprovalRole(actor);
    return this.prisma.$transaction(async tx => {
      const admission = await this.lockAdmission(tx, id, actor);
      if (admission.admissionNumber) {
        const student = await tx.student.findUnique({ where: { admissionNumber: admission.admissionNumber } });
        if (!student) throw new ConflictException("Enrollment link needs administrator reconciliation");
        return { admission, student, alreadyEnrolled: true };
      }
      if (admission.archivedAt || admission.status !== "APPROVED") throw new BadRequestException("Admission must be approved before enrollment");
      await this.validateApplication(tx, admission);
      if (admission.enquiryId) await this.lockEnquiry(tx, admission.enquiryId, id, actor);
      const level = await checkEnrollmentCapacity(tx, dto.classLevelId ?? admission.classLevelId!, dto.sectionId, admission.academicYearId!, actor, dto.capacityOverride, dto.overrideReason);
      if (level.id !== admission.classLevelId) throw new BadRequestException("The class must match the approved application");
      const [firstName, ...rest] = admission.studentName.trim().split(/\s+/);
      let joiningDate = toDate(dto.joiningDate) ?? admission.joiningDate ?? new Date();
      if (level.academicYear?.startDate && level.academicYear.endDate) {
        if (!dto.joiningDate && !admission.joiningDate && joiningDate < level.academicYear.startDate) joiningDate = level.academicYear.startDate;
        if (schoolDay(joiningDate) < schoolDay(level.academicYear.startDate) || schoolDay(joiningDate) > schoolDay(level.academicYear.endDate)) throw new BadRequestException("Joining date must fall within the approved academic year");
      }
      const existingGuardian = dto.guardianId ? await tx.guardian.findFirst({ where: { id: dto.guardianId, archivedAt: null } }) : null;
      if (dto.guardianId && !existingGuardian) throw new BadRequestException("Selected guardian is not available");
      const admissionNumber = await this.sequence.next("STU", tx);
      const student = await tx.student.create({ data: {
        admissionNumber, firstName, lastName: rest.join(" ") || null, classLevelId: level.id, academicYearId: admission.academicYearId,
        sectionId: dto.sectionId ?? null, joiningDate, notes: admission.notes, dob: admission.childDob,
        phone: admission.phone, address: admission.address, emergencyContact: admission.emergencyContact,
        guardians: { create: { primary: true, guardian: existingGuardian ? { connect: { id: existingGuardian.id } } : { create: { name: admission.parentName!, relationship: "Parent / guardian", mobile: admission.phone!, email: admission.email, address: admission.address, consentAt: admission.consentAt } } } },
      } });
      const updated = await tx.admission.update({ where: { id }, data: { status: AdmissionStatus.ENROLLED, admissionNumber, studentId: student.id, joiningDate } });
      if (admission.enquiryId) await this.stage(tx, admission.enquiryId, EnquiryStatus.ENROLLED, "Student enrolled", actor, { studentId: student.id });
      await this.audit(tx, id, "ADMISSION_ENROLLED", actor, { studentId: student.id, admissionNumber, capacityOverride: Boolean(dto.capacityOverride), overrideReason: dto.overrideReason ?? null });
      return { admission: updated, student, alreadyEnrolled: false };
    });
  }
  async validateApplication(tx: Tx, row: { id: string; academicYearId: string | null; classLevelId: string | null; parentName: string | null; phone: string | null; childDob: Date | null; address: string | null; emergencyContact: string | null; consentAt: Date | null; requiredDocuments: string[] }) {
    if (!row.academicYearId || !row.classLevelId || !row.parentName || !row.phone || !row.childDob || !row.address || !row.emergencyContact || !row.consentAt) throw new BadRequestException("Complete child, parent, date of birth, address, emergency contact, academic year, class and privacy consent");
    if (row.childDob > new Date()) throw new BadRequestException("Child date of birth cannot be in the future");
    const level = await tx.classLevel.findFirst({ where: { id: row.classLevelId, academicYearId: row.academicYearId, active: true, academicYear: { active: true } } });
    if (!level) throw new BadRequestException("Academic year or class is inactive or mismatched");
    const docs = await tx.applicationDocument.findMany({ where: { admissionId: row.id }, select: { type: true } });
    const missing = row.requiredDocuments.filter(type => !docs.some(doc => doc.type === type));
    if (missing.length) throw new BadRequestException(`Required documents missing: ${missing.join(", ")}`);
  }
  private async lockAdmission(tx: Tx, id: string, actor?: AuthUser) {
    await tx.$queryRaw`SELECT "id" FROM "Admission" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.admission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Admission not found");
    if (actor && isCounsellor(actor)) assertEnquiryAccess(row.enquiryId ? await tx.enquiry.findUnique({ where: { id: row.enquiryId } }) : null, actor);
    return row;
  }
  private async lockEnquiry(tx: Tx, id: string, excludeAdmissionId?: string, actor?: AuthUser) {
    await tx.$queryRaw`SELECT "id" FROM "Enquiry" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.enquiry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Enquiry not found");
    if (actor) assertEnquiryAccess(row, actor);
    if (row.archivedAt || ["ADMISSION_CONFIRMED", "ENROLLED", "LOST", "NOT_INTERESTED", "CLOSED", "REJECTED"].includes(row.status)) throw new BadRequestException("This enquiry is archived or already enrolled");
    if (await tx.admission.findFirst({ where: { enquiryId: id, archivedAt: null, ...(excludeAdmissionId ? { id: { not: excludeAdmissionId } } : {}), status: { notIn: [AdmissionStatus.REJECTED, AdmissionStatus.CANCELLED] } } })) throw new ConflictException("This enquiry already has an active application");
    return row;
  }
  private assertOrdinaryStatus(status?: AdmissionStatus) {
    if (status && !editable.includes(status)) throw new BadRequestException("Use application submission, review or administrator confirmation actions for this status");
  }
  private async stage(tx: Tx, enquiryId: string, status: EnquiryStatus, summary: string, actor?: AuthUser, metadata?: Prisma.InputJsonValue) {
    await tx.enquiry.update({ where: { id: enquiryId }, data: { status, purpose: "ADMISSION" } });
    await tx.enquiryActivity.create({ data: { enquiryId, type: "APPLICATION", summary, actorId: actor?.id, actorName: actor?.name, metadata } });
  }
  private audit(tx: Tx, entityId: string, action: string, actor?: AuthUser, data?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { entityId, module: "admissions", action, userId: actor?.id, newValue: data } });
  }
}
