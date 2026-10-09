import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { contains, pageArgs, paginated } from "../common/utils/pagination.js";
import { SubscribeDto, SubscriberQueryDto, UpdateSubscriberDto } from "./dto/newsletter.dto.js";

export type SubscribeStatus = "subscribed" | "already";

@Injectable()
export class NewsletterService {
  constructor(private prisma: PrismaService) {}

  async subscribe(dto: SubscribeDto): Promise<SubscribeStatus> {
    // Bots fill the hidden field; answer as if it worked so they learn nothing.
    if (dto.website) return "subscribed";

    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email: dto.email } });
    if (existing?.active) return "already";
    if (existing) {
      await this.prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { active: true } });
      return "subscribed";
    }
    try {
      await this.prisma.newsletterSubscriber.create({ data: { email: dto.email } });
      return "subscribed";
    } catch (error) {
      // Two submissions of the same email at once: the other one won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return "already";
      throw error;
    }
  }

  list(query: SubscriberQueryDto) {
    const where: Prisma.NewsletterSubscriberWhereInput = {
      email: contains(query.search),
      ...(query.active ? { active: query.active === "true" } : {}),
    };
    return paginated(
      query,
      this.prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(query) }),
      () => this.prisma.newsletterSubscriber.count({ where }),
    );
  }

  update(id: string, dto: UpdateSubscriberDto) {
    return this.prisma.newsletterSubscriber.update({ where: { id }, data: { active: dto.active } });
  }

  async remove(id: string) {
    await this.prisma.newsletterSubscriber.delete({ where: { id } });
  }
}
