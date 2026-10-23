import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SequenceService } from "../prisma/sequence.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import { checkEnrollmentCapacity } from "../common/utils/enrollment-capacity.js";
import type { AuthUser } from "../common/decorators/current-user.decorator.js";
import { isAdministrator } from "../common/utils/crm-policy.js";
import { CreateGuardianDto, CreateStudentDto, StudentQueryDto, UpdateGuardianDto, UpdateStudentDto } from "./dto/create-student.dto.js";
const DATE_FIELDS = ["dob", "joiningDate"];
const CLASS_INCLUDE = { classLevel: { select: { id: true, name: true, code: true, academicYearId: true } }, section: { select: { id: true, name: true } }, academicYear: { select: { id: true, name: true } } } satisfies Prisma.StudentInclude;
@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService, private sequence: SequenceService) {}
  list(query: StudentQueryDto) {
    const search = contains(query.search);
    const where: Prisma.StudentWhereInput = { archivedAt: query.archived === "true" ? { not: null } : null, status: query.status, academicYearId: query.academicYearId, classLevelId: query.classLevelId, sectionId: query.sectionId, ...(search ? { OR: [{ firstName: search }, { lastName: search }, { admissionNumber: search }, { phone: search }] } : {}) };
    return paginated(query, this.prisma.student.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: CLASS_INCLUDE, ...pageArgs(query) }), () => this.prisma.student.count({ where }));
  }
  async detail(id: string, actor?: AuthUser) {
    const student = await this.prisma.student.findUnique({ where: { id }, include: {
      ...CLASS_INCLUDE, guardians: { include: { guardian: true }, orderBy: { primary: "desc" } },
      admission: { select: { id: true, applicationNumber: true, admissionNumber: true, status: true, createdAt: true } },
      studentFees: actor && !isAdministrator(actor) && actor.role !== "ACCOUNTANT" ? false : { include: { payments: { orderBy: { paidAt: "desc" } } }, orderBy: { dueDate: "asc" } },
    } });
    if (!student) throw new NotFoundException("Student not found"); return student;
  }
  async create(dto: CreateStudentDto) {
    if (dto.dob && new Date(dto.dob) > new Date()) throw new BadRequestException("Date of birth cannot be in the future");
    return this.prisma.$transaction(async tx => {
      const level = dto.classLevelId ? await tx.classLevel.findUnique({ where: { id: dto.classLevelId } }) : null;
      const yearId = dto.academicYearId ?? level?.academicYearId;
      if (!level || !yearId) throw new BadRequestException("Choose a class with an active academic year");
      await checkEnrollmentCapacity(tx, level.id, dto.sectionId, yearId);
      return tx.student.create({ data: { ...withDates(dto, DATE_FIELDS), academicYearId: yearId, admissionNumber: await this.sequence.next("STU", tx) }, include: CLASS_INCLUDE });
    });
  }
  async update(id: string, dto: UpdateStudentDto) {
    if (dto.dob && new Date(dto.dob) > new Date()) throw new BadRequestException("Date of birth cannot be in the future");
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.student.findUnique({ where: { id } }); if (!current) throw new NotFoundException("Student not found");
      const classLevelId = dto.classLevelId === undefined ? current.classLevelId : dto.classLevelId;
      const sectionId = dto.sectionId === undefined ? dto.classLevelId && dto.classLevelId !== current.classLevelId ? null : current.sectionId : dto.sectionId;
      const level = classLevelId ? await tx.classLevel.findUnique({ where: { id: classLevelId } }) : null;
      const yearId = dto.academicYearId ?? level?.academicYearId ?? current.academicYearId;
      if (sectionId && (!level || (await tx.section.findUnique({ where: { id: sectionId } }))?.classLevelId !== level.id)) throw new BadRequestException("Section does not belong to the selected class");
      if ((dto.status ?? current.status) === "ACTIVE" && classLevelId) {
        if (!yearId) throw new BadRequestException("Academic year is required");
        await checkEnrollmentCapacity(tx, classLevelId, sectionId, yearId, undefined, false, undefined, id);
      }
      return tx.student.update({ where: { id }, data: { ...withDates(dto, DATE_FIELDS), sectionId, academicYearId: yearId, ...(dto.status === "ACTIVE" ? { archivedAt: null } : {}) }, include: CLASS_INCLUDE });
    });
  }
  remove(id: string) { return this.prisma.student.update({ where: { id }, data: { archivedAt: new Date(), status: "INACTIVE" }, select: { id: true } }); }
  async addGuardian(studentId: string, dto: CreateGuardianDto) {
    const { primary = false, ...guardian } = dto;
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
      await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
      if (primary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { primary: false } });
      return tx.guardian.create({ data: { ...guardian, students: { create: { studentId, primary } } } });
    });
  }
  async updateGuardian(studentId: string, guardianId: string, dto: UpdateGuardianDto) {
    const { primary, ...guardian } = dto;
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
      await tx.studentGuardian.findUniqueOrThrow({ where: { studentId_guardianId: { studentId, guardianId } } });
      if (primary !== undefined) {
        if (primary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { primary: false } });
        await tx.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: { primary } });
      }
      return tx.guardian.update({ where: { id: guardianId }, data: guardian });
    });
  }
  async removeGuardian(studentId: string, guardianId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${studentId} FOR UPDATE`;
      // Unlink only; family contact records and other sibling links must be retained.
      return tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
    });
  }
}
