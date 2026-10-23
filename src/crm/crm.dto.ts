import { Transform } from "class-transformer";
import { Type } from "class-transformer";
import { PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { AttendanceStatus, EnquirySource, VisitStatus, WorkStatus } from "../generated/prisma/enums.js";
import { Nullable } from "../common/decorators/nullable.decorator.js";
import { ListQueryDto } from "../common/dto/list-query.dto.js";
import { PHONE_PATTERN } from "../common/validators.js";
export class CrmQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(["ADMISSION", "CONTACT"]) purpose?: string;
  @IsOptional() @IsIn(["true", "false"]) archived?: "true" | "false";
  @IsOptional() @IsIn(["true", "false"]) openOnly?: "true" | "false";
  @IsOptional() @IsIn(["true", "false"]) followUpDue?: "true" | "false";
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsUUID() assignedStaffId?: string;
  @IsOptional() @IsUUID() enquiryId?: string;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() classLevelId?: string;
  @IsOptional() @IsString() @MaxLength(60) program?: string;
  @IsOptional() @IsEnum(EnquirySource) source?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(["TODAY", "UPCOMING", "OVERDUE"]) view?: string;
}
export class FollowUpTaskDto {
  @IsUUID() enquiryId!: string;
  @IsUUID() assignedStaffId!: string;
  @IsDateString() dueAt!: string;
  @IsIn(["CALL", "WHATSAPP", "EMAIL", "IN_PERSON"]) method!: string;
  @IsOptional() @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"]) priority?: string;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
}
export class UpdateFollowUpTaskDto extends PartialType(FollowUpTaskDto) {
  @IsOptional() @IsEnum(WorkStatus) status?: WorkStatus;
  @Nullable() @IsString() @MaxLength(1000) outcome?: string | null;
}
export class VisitDto {
  @IsUUID() enquiryId!: string;
  @IsUUID() assignedStaffId!: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @Nullable() @IsUUID() slotId?: string | null;
  @Nullable() @IsString() @MaxLength(4000) feedback?: string | null;
}
export class UpdateVisitDto extends PartialType(VisitDto) {
  @IsOptional() @IsEnum(VisitStatus) status?: VisitStatus;
}
export class SlotDto {
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsInt() @Min(1) @Max(100) capacity!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class TaskDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsUUID() assignedStaffId!: string;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"]) priority?: string;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
  @Nullable() @IsUUID() enquiryId?: string | null;
  @Nullable() @IsUUID() admissionId?: string | null;
  @Nullable() @IsUUID() studentId?: string | null;
  @Nullable() @IsUUID() visitId?: string | null;
}
export class UpdateTaskDto extends PartialType(TaskDto) { @IsOptional() @IsEnum(WorkStatus) status?: WorkStatus; }
export class NoteDto { @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(4000) notes!: string; }
export class TemplateDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(["EMAIL", "WHATSAPP", "SMS", "CALL", "IN_PERSON"]) channel!: string;
  @Nullable() @IsString() @MaxLength(200) subject?: string | null;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(4000) body!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateTemplateDto extends PartialType(TemplateDto) {}
export class CommunicationDto {
  @IsUUID() enquiryId!: string;
  @IsIn(["EMAIL", "WHATSAPP", "SMS", "CALL", "IN_PERSON"]) channel!: string;
  @Nullable() @IsString() @MaxLength(200) subject?: string | null;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(4000) body!: string;
  @Nullable() @IsString() @MaxLength(1000) outcome?: string | null;
}
export class GuardianDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(40) relationship!: string;
  @IsString() @Matches(PHONE_PATTERN) mobile!: string;
  @Nullable() @IsString() @Matches(PHONE_PATTERN) whatsapp?: string | null;
  @Nullable() @IsEmail() @MaxLength(160) email?: string | null;
  @Nullable() @IsString() @MaxLength(500) address?: string | null;
  @Nullable() @IsString() @MaxLength(80) occupation?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(["CALL", "EMAIL", "WHATSAPP", "SMS"], { each: true }) communicationPreferences?: string[];
  @IsOptional() @IsBoolean() consent?: boolean;
}
export class UpdateGuardianRecordDto extends PartialType(GuardianDto) {}
export class GuardianLinkDto {
  @IsUUID() studentId!: string;
  @IsOptional() @IsBoolean() primary?: boolean;
}
export class AttendanceEntryDto {
  @IsUUID() studentId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @Nullable() @IsString() @MaxLength(500) notes?: string | null;
}
export class AttendanceBatchDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) day!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AttendanceEntryDto) entries!: AttendanceEntryDto[];
}
export class AdmissionSettingsDto {
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[A-Za-z0-9{}-]+$/) numberPattern?: string;
  @IsArray() @ArrayMaxSize(12) @IsIn(["BIRTH_CERTIFICATE", "CHILD_PHOTO", "ADDRESS_PROOF", "TRANSFER_CERTIFICATE", "OTHER"], { each: true }) requiredDocuments!: string[];
  @IsOptional() @IsInt() @Min(1) @Max(365) followUpDefaultDays?: number;
}
export class DocumentTypeDto { @IsIn(["BIRTH_CERTIFICATE", "CHILD_PHOTO", "ADDRESS_PROOF", "TRANSFER_CERTIFICATE", "OTHER"]) type!: string; }
