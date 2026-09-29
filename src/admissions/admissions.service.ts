import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SequenceService } from "../prisma/sequence.service";
import { Prisma } from "../generated/prisma/client";
import { AdmissionStatus, EnquiryStatus } from "../generated/prisma/enums";
import { toDate, withDates } from "../common/utils/dates";
import { contains, pageArgs, paginated } from "../common/utils/pagination";
import { AdmissionQueryDto, ConfirmAdmissionDto, CreateAdmissionDto, UpdateAdmissionDto } from "./dto/create-admission.dto";

@Injectable()
export class AdmissionsService {
  constructor(
    private prisma: PrismaService,
    private sequence: SequenceService,
  ) {}

  list(query: AdmissionQueryDto) {
    const search = contains(query.search);
    const where: Prisma.AdmissionWhereInput = {
      status: query.status,
      ...(search ? { OR: [{ studentName: search }, { applicationNumber: search }, { admissionNumber: search }, { className: search }] } : {}),
    };
    return paginated(query, this.prisma.admission.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(query) }), () => this.prisma.admission.count({ where }));
  }

  async detail(id: string) {
    const admission = await this.prisma.admission.findUnique({ where: { id } });
    if (!admission) throw new NotFoundException("Admission not found");
    return admission;
  }

  async create(dto: CreateAdmissionDto) {
    const admission = await this.prisma.admission.create({ data: { ...withDates(dto, ["joiningDate"]), applicationNumber: await this.sequence.next("ADM") } });
    if (dto.enquiryId) await this.prisma.enquiry.updateMany({ where: { id: dto.enquiryId, status: { notIn: [EnquiryStatus.ADMISSION_CONFIRMED] } }, data: { status: EnquiryStatus.APPLICATION_STARTED } });
    return admission;
  }

  update(id: string, dto: UpdateAdmissionDto) {
    return this.prisma.admission.update({ where: { id }, data: withDates(dto, ["joiningDate"]) });
  }

  remove(id: string) {
    return this.prisma.admission.delete({ where: { id }, select: { id: true } });
  }

  /**
   * Confirms the admission and creates the matching student record in one transaction.
   * The class is matched by name when no classLevelId is given; the linked enquiry is marked confirmed.
   */
  async confirm(id: string, dto: ConfirmAdmissionDto) {
    const admission = await this.detail(id);
    if (admission.admissionNumber) throw new BadRequestException("This admission has already been converted to a student");
    if (admission.status === AdmissionStatus.REJECTED || admission.status === AdmissionStatus.CANCELLED) throw new BadRequestException("Rejected or cancelled admissions cannot be confirmed");

    const classLevelId =
      dto.classLevelId ?? (await this.prisma.classLevel.findFirst({ where: { name: { equals: admission.className, mode: "insensitive" } }, select: { id: true } }))?.id ?? null;
    const [firstName, ...rest] = admission.studentName.trim().split(/\s+/);
    const joiningDate = toDate(dto.joiningDate) ?? admission.joiningDate ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const admissionNumber = await this.sequence.next("STU", tx);
      const student = await tx.student.create({
        data: { admissionNumber, firstName, lastName: rest.join(" ") || null, classLevelId, sectionId: dto.sectionId ?? null, joiningDate, notes: admission.notes },
      });
      const updated = await tx.admission.update({ where: { id }, data: { status: AdmissionStatus.CONFIRMED, admissionNumber, joiningDate } });
      if (admission.enquiryId) await tx.enquiry.updateMany({ where: { id: admission.enquiryId }, data: { status: EnquiryStatus.ADMISSION_CONFIRMED } });
      return { admission: updated, student };
    });
  }
}
