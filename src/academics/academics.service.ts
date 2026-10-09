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
    return this.prisma.academicYear.delete({ where: { id }, select: { id: true } });
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
    return this.prisma.classLevel.update({ where: { id }, data: dto });
  }

  async removeClass(id: string) {
    const students = await this.prisma.student.count({ where: { classLevelId: id } });
    if (students) throw new BadRequestException(`Move or remove the ${students} student(s) in this class first`);
    await this.prisma.classLevel.delete({ where: { id } });
  }

  createSection(dto: CreateSectionDto) {
    return this.prisma.section.create({ data: dto });
  }

  updateSection(id: string, dto: UpdateSectionDto) {
    return this.prisma.section.update({ where: { id }, data: dto });
  }

  async removeSection(id: string) {
    const students = await this.prisma.student.count({ where: { sectionId: id } });
    if (students) throw new BadRequestException(`Move or remove the ${students} student(s) in this section first`);
    await this.prisma.section.delete({ where: { id } });
  }

  /** Only one academic year can be current at a time. */
  private saveYear(id: string | null, dto: UpdateAcademicYearDto) {
    const data = withDates(dto, ["startDate", "endDate"]);
    return this.prisma.$transaction(async (tx) => {
      if (dto.current) await tx.academicYear.updateMany({ where: { current: true, ...(id ? { id: { not: id } } : {}) }, data: { current: false } });
      return id ? tx.academicYear.update({ where: { id }, data }) : tx.academicYear.create({ data });
    });
  }

  private assertRange(start: string | Date, end: string | Date) {
    if (new Date(start) >= new Date(end)) throw new BadRequestException("The start date must be before the end date");
  }
}
