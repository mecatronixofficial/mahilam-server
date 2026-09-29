import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SequenceService } from "../prisma/sequence.service";
import { Prisma } from "../generated/prisma/client";
import { withDates } from "../common/utils/dates";
import { contains, pageArgs, paginated } from "../common/utils/pagination";
import { CreateGuardianDto, CreateStudentDto, StudentQueryDto, UpdateGuardianDto, UpdateStudentDto } from "./dto/create-student.dto";

const DATE_FIELDS = ["dob", "joiningDate"];
const CLASS_INCLUDE = {
  classLevel: { select: { id: true, name: true, code: true } },
  section: { select: { id: true, name: true } },
} satisfies Prisma.StudentInclude;

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private sequence: SequenceService,
  ) {}

  list(query: StudentQueryDto) {
    const search = contains(query.search);
    const where: Prisma.StudentWhereInput = {
      status: query.status,
      classLevelId: query.classLevelId,
      sectionId: query.sectionId,
      ...(search ? { OR: [{ firstName: search }, { lastName: search }, { admissionNumber: search }, { phone: search }] } : {}),
    };
    return paginated(query, this.prisma.student.findMany({ where, orderBy: { createdAt: "desc" }, include: CLASS_INCLUDE, ...pageArgs(query) }), () => this.prisma.student.count({ where }));
  }

  async detail(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        ...CLASS_INCLUDE,
        guardians: { include: { guardian: true }, orderBy: { primary: "desc" } },
        studentFees: { include: { payments: { orderBy: { paidAt: "desc" } } }, orderBy: { dueDate: "asc" } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  async create(dto: CreateStudentDto) {
    await this.assertSectionInClass(dto.classLevelId, dto.sectionId);
    return this.prisma.student.create({ data: { ...withDates(dto, DATE_FIELDS), admissionNumber: await this.sequence.next("STU") }, include: CLASS_INCLUDE });
  }

  async update(id: string, dto: UpdateStudentDto) {
    if (dto.sectionId) {
      const classLevelId = dto.classLevelId ?? (await this.prisma.student.findUniqueOrThrow({ where: { id }, select: { classLevelId: true } })).classLevelId;
      await this.assertSectionInClass(classLevelId, dto.sectionId);
    }
    return this.prisma.student.update({ where: { id }, data: withDates(dto, DATE_FIELDS), include: CLASS_INCLUDE });
  }

  remove(id: string) {
    return this.prisma.student.delete({ where: { id }, select: { id: true } });
  }

  async addGuardian(studentId: string, dto: CreateGuardianDto) {
    const { primary = false, ...guardian } = dto;
    return this.prisma.$transaction(async (tx) => {
      await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { id: true } });
      if (primary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { primary: false } });
      return tx.guardian.create({ data: { ...guardian, students: { create: { studentId, primary } } } });
    });
  }

  async updateGuardian(studentId: string, guardianId: string, dto: UpdateGuardianDto) {
    const { primary, ...guardian } = dto;
    return this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.findUniqueOrThrow({ where: { studentId_guardianId: { studentId, guardianId } } });
      if (primary !== undefined) {
        if (primary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { primary: false } });
        await tx.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: { primary } });
      }
      return tx.guardian.update({ where: { id: guardianId }, data: guardian });
    });
  }

  /** Unlinks the guardian, and deletes them when no other student references them. */
  async removeGuardian(studentId: string, guardianId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
      const remaining = await tx.studentGuardian.count({ where: { guardianId } });
      if (!remaining) await tx.guardian.delete({ where: { id: guardianId } });
    });
  }

  private async assertSectionInClass(classLevelId?: string | null, sectionId?: string | null) {
    if (!sectionId) return;
    const section = await this.prisma.section.findUnique({ where: { id: sectionId }, select: { classLevelId: true } });
    if (!section) throw new BadRequestException("Section not found");
    if (classLevelId && section.classLevelId !== classLevelId) throw new BadRequestException("Section does not belong to the selected class");
  }
}
