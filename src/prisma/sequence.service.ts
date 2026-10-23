import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { schoolDay } from "../common/utils/school-time.js";
export type SequencePrefix = "ENQ" | "STU" | "ADM" | "RCP";
@Injectable()
export class SequenceService {
  constructor(private prisma: PrismaService) {}
  async next(prefix: SequencePrefix, client: Pick<PrismaService, "sequence" | "crmSetting"> = this.prisma) {
    const year = schoolDay().slice(0, 4);
    const key = `${prefix}-${year}`;
    const { value } = await client.sequence.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } }, select: { value: true } });
    const setting = await client.crmSetting.findUnique({ where: { key: "admissions" }, select: { value: true } });
    const pattern = (setting?.value as { numberPattern?: string } | undefined)?.numberPattern ?? "LM-{type}-{year}-{number}";
    return pattern.replace("{type}", prefix).replace("{year}", year).replace("{number}", String(value).padStart(4, "0"));
  }
}
