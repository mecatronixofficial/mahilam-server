import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export type SequencePrefix = "ENQ" | "STU" | "ADM" | "RCP";

/**
 * Issues human-readable numbers such as `LM-ENQ-2026-0007`.
 * The counter is incremented with a single atomic upsert, so concurrent requests and
 * deleted rows can never produce duplicates (unlike `count() + 1`).
 */
@Injectable()
export class SequenceService {
  constructor(private prisma: PrismaService) {}

  async next(prefix: SequencePrefix, client: Pick<PrismaService, "sequence"> = this.prisma) {
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    const { value } = await client.sequence.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return `LM-${prefix}-${year}-${String(value).padStart(4, "0")}`;
  }
}
