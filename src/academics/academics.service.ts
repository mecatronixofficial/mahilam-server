import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudentStatus } from "../generated/prisma/enums.js";
import { withDates } from "../common/utils/dates.js";
import {
  CreateAcademicYearDto,
  CreateClassLevelDto,
  CreateSectionDto,
  UpdateAcademicYearDto,
  UpdateClassLevelDto,
  UpdateSectionDto,
} from "./dto/academics.dto.js";

const activeStudents = { where: { status: StudentStatus.ACTIVE } };

@Injectable()
export class AcademicsService {
  constructor(private prisma: PrismaService) {}

  years() {
    return this.prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  }

  createYear(dto: CreateAcademicYearDto) {
    this.assertRange(dto.startDate, dto.endDate);
    return this.saveYear(null, dto);
  }

  async updateYear(id: string, dto: UpdateAcademicYearDto) {
    if (dto.startDate || dto.endDate) {
      const year = await this.prisma.academicYear.findUniqueOrThrow({ where: { id } });
      this.assertRange(dto.startDate ?? year.startDate, dto.endDate ?? year.endDate);
    }
    return this.saveYear(id, dto);
  }

  removeYear(id: string) {
    return this.prisma.academicYear.update({ where: { id }, data: { active: false, current: false }, select: { id: true } });
  }

  classes() {
    return this.prisma.classLevel.findMany({
      include: { sections: { orderBy: { name: "asc" }, include: { _count: { select: { students: activeStudents } } } }, _count: { select: { students: activeStudents } } },
      orderBy: { displayOrder: "asc" },
    });
  }

  createClass(dto: CreateClassLevelDto) {
    return this.prisma.classLevel.create({ data: dto });
  }

  updateClass(id: string, dto: UpdateClassLevelDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClassLevel" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.classLevel.findUniqueOrThrow({ where: { id } });
      const occupied = await tx.student.count({ where: { classLevelId: id, archivedAt: null, status: "ACTIVE" } });
      if (dto.capacity != null && occupied > dto.capacity) throw new BadRequestException("Class capacity cannot be less than active enrollment");
      if (dto.academicYearId !== undefined && dto.academicYearId !== current.academicYearId && await tx.student.count({ where: { classLevelId: id } })) throw new BadRequestException("A class with student history cannot move to another academic year");
      return tx.classLevel.update({ where: { id }, data: dto });
    });
  }

  async removeClass(id: string) {
    const students = await this.prisma.student.count({ where: { classLevelId: id, archivedAt: null, status: "ACTIVE" } });
    if (students) throw new BadRequestException(`Reassign the ${students} active student(s) in this class first`);
    await this.prisma.classLevel.update({ where: { id }, data: { active: false } });
  }

  createSection(dto: CreateSectionDto) {
    return this.prisma.section.create({ data: dto });
  }

  updateSection(id: string, dto: UpdateSectionDto) {
    return this.prisma.$transaction(async tx => {
      const original = await tx.section.findUniqueOrThrow({ where: { id } });
      await tx.$queryRaw`SELECT "id" FROM "ClassLevel" WHERE "id" = ${original.classLevelId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Section" WHERE "id" = ${id} FOR UPDATE`;
      const occupied = await tx.student.count({ where: { sectionId: id, archivedAt: null, status: "ACTIVE" } });
      if (dto.capacity != null && occupied > dto.capacity) throw new BadRequestException("Section capacity cannot be less than active enrollment");
      if (dto.classLevelId && dto.classLevelId !== original.classLevelId && await tx.student.count({ where: { sectionId: id } })) throw new BadRequestException("A section with student history cannot move to another class");
      return tx.section.update({ where: { id }, data: dto });
    });
  }

  async removeSection(id: string) {
    const students = await this.prisma.student.count({ where: { sectionId: id, archivedAt: null, status: "ACTIVE" } });
    if (students) throw new BadRequestException(`Reassign the ${students} active student(s) in this section first`);
    await this.prisma.section.update({ where: { id }, data: { active: false } });
  }

  /** Only one academic year can be current at a time. */
  private saveYear(id: string | null, dto: UpdateAcademicYearDto) {
    const data = withDates(dto, ["startDate", "endDate"]);
    if (dto.active === false) data.current = false;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('current-academic-year', 0))`;
      if (dto.current && dto.active === false) throw new BadRequestException("An inactive academic year cannot be current");
      if (dto.current && id && dto.active !== true && !(await tx.academicYear.findUniqueOrThrow({ where: { id }, select: { active: true } })).active) throw new BadRequestException("Activate the academic year before making it current");
      if (dto.current) await tx.academicYear.updateMany({ where: { current: true, ...(id ? { id: { not: id } } : {}) }, data: { current: false } });
      return id ? tx.academicYear.update({ where: { id }, data }) : tx.academicYear.create({ data });
    });
  }

  private assertRange(start: string | Date, end: string | Date) {
    if (new Date(start) >= new Date(end)) throw new BadRequestException("The start date must be before the end date");
  }
}
