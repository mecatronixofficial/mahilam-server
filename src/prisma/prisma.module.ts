import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { SequenceService } from "./sequence.service.js";

@Global()
@Module({ providers: [PrismaService, SequenceService], exports: [PrismaService, SequenceService] })
export class PrismaModule {}
