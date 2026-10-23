import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AuthUser } from "../decorators/current-user.decorator.js";
import { isAdministrator } from "./crm-policy.js";
export async function checkEnrollmentCapacity(tx: Prisma.TransactionClient, classLevelId: string, sectionId: string | null | undefined, academicYearId: string, actor?: AuthUser, override?: boolean, reason?: string | null, excludeStudentId?: string) {
  await tx.$queryRaw`SELECT "id" FROM "ClassLevel" WHERE "id" = ${classLevelId} FOR UPDATE`;
  const level = await tx.classLevel.findUnique({ where: { id: classLevelId }, include: { academicYear: true } });
  if (!level?.active || !level.academicYear?.active || level.academicYearId !== academicYearId) throw new BadRequestException("Choose an active class belonging to the application's academic year");
  if (override && (!actor || !isAdministrator(actor) || !reason?.trim())) throw new ForbiddenException("Capacity override requires an administrator and a recorded reason");
  const where = { status: "ACTIVE" as const, archivedAt: null, ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}) };
  if (level.capacity !== null && await tx.student.count({ where: { ...where, classLevelId } }) >= level.capacity && !override) throw new BadRequestException("Class capacity is full");
  if (sectionId) {
    await tx.$queryRaw`SELECT "id" FROM "Section" WHERE "id" = ${sectionId} FOR UPDATE`;
    const section = await tx.section.findUnique({ where: { id: sectionId } });
    if (!section?.active || section.classLevelId !== classLevelId) throw new BadRequestException("Section does not belong to the selected active class");
    if (section.capacity !== null && await tx.student.count({ where: { ...where, sectionId } }) >= section.capacity && !override) throw new BadRequestException("Section capacity is full");
  }
  return level;
}
