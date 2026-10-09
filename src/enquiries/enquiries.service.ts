import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { SequenceService } from "../prisma/sequence.service.js";
import { NotificationsService } from "../integrations/notifications.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { EnquiryStatus } from "../generated/prisma/enums.js";
import { toDate, withDates } from "../common/utils/dates.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import { CreateEnquiryDto, CreateFollowUpDto, CreateInternalEnquiryDto, EnquiryQueryDto, UpdateEnquiryDto } from "./dto/create-enquiry.dto.js";

const DATE_FIELDS = ["studentDob", "nextFollowUpDate"];

@Injectable()
export class EnquiriesService {
  constructor(
    private prisma: PrismaService,
    private sequence: SequenceService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateEnquiryDto) {
    const enquiry = await this.prisma.enquiry.create({ data: { ...dto, enquiryNumber: await this.sequence.next("ENQ") } });
    // The enquiry is already saved; notify in the background so the parent is not kept waiting.
    void this.notifications.sendNewEnquiry(enquiry);
    return { id: enquiry.id, enquiryNumber: enquiry.enquiryNumber };
  }

  async createInternal(dto: CreateInternalEnquiryDto) {
    return this.prisma.enquiry.create({ data: { ...withDates(dto, DATE_FIELDS), enquiryNumber: await this.sequence.next("ENQ") } });
  }

  list(query: EnquiryQueryDto) {
    const search = contains(query.search);
    const where: Prisma.EnquiryWhereInput = {
      status: query.status,
      source: query.source,
      assignedStaffId: query.assignedStaffId,
      ...(query.followUpDue === "true" ? { nextFollowUpDate: { lte: endOfToday() } } : {}),
      ...(search ? { OR: [{ parentName: search }, { studentName: search }, { phone: search }, { enquiryNumber: search }, { email: search }] } : {}),
    };
    return paginated(query, this.prisma.enquiry.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(query) }), () => this.prisma.enquiry.count({ where }));
  }

  async detail(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, include: { followUps: { orderBy: { createdAt: "desc" } } } });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    return enquiry;
  }

  update(id: string, dto: UpdateEnquiryDto) {
    return this.prisma.enquiry.update({ where: { id }, data: withDates(dto, DATE_FIELDS) });
  }

  remove(id: string) {
    return this.prisma.enquiry.delete({ where: { id }, select: { id: true } });
  }

  async addFollowUp(id: string, dto: CreateFollowUpDto, staffName: string) {
    const { status, ...rest } = dto;
    const nextFollowUp = toDate(dto.nextFollowUp);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.enquiryFollowUp.create({ data: { ...rest, enquiryId: id, nextFollowUp, staffName: dto.staffName || staffName } });
      const current = await tx.enquiry.findUniqueOrThrow({ where: { id }, select: { status: true } });
      await tx.enquiry.update({
        where: { id },
        data: {
          nextFollowUpDate: nextFollowUp ?? null,
          // A first contact moves a NEW enquiry forward automatically unless a stage was given.
          status: status ?? (current.status === EnquiryStatus.NEW ? EnquiryStatus.CONTACTED : undefined),
        },
      });
      return followUp;
    });
  }

  removeFollowUp(enquiryId: string, followUpId: string) {
    return this.prisma.enquiryFollowUp.delete({ where: { id: followUpId, enquiryId }, select: { id: true } });
  }
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}
