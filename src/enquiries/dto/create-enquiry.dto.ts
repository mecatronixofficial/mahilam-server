import { Transform } from "class-transformer";
import { PartialType } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { EnquirySource, EnquiryStatus } from "../../generated/prisma/enums.js";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";
import { PHONE_MESSAGE, PHONE_PATTERN } from "../../common/validators.js";
const trim = Transform(({ value }) => typeof value === "string" ? value.trim() : value);
export class CreateEnquiryDto {
  @trim @IsString() @MinLength(2) @MaxLength(80) parentName!: string;
  @trim @IsString() @MinLength(2) @MaxLength(80) studentName!: string;
  @trim @IsString() @Matches(PHONE_PATTERN, { message: `phone ${PHONE_MESSAGE}` }) phone!: string;
  @Nullable() @IsString() @Matches(PHONE_PATTERN) whatsapp?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN) alternatePhone?: string | null;
  @Transform(({ value }) => typeof value === "string" ? value.trim() || undefined : value) @Nullable() @IsEmail() @MaxLength(160) email?: string | null;
  @trim @IsString() @MinLength(1) @MaxLength(60) interestedClass!: string;
  @Nullable() @IsString() @MaxLength(2000) message?: string | null;
  @IsOptional() @IsEnum(EnquirySource) source?: EnquirySource;
  @Nullable() @IsUUID() academicYearId?: string | null;
  @IsOptional() @IsIn(["ADMISSION", "CONTACT"]) purpose?: string;
  @IsOptional() @IsBoolean() consent?: boolean;
  @Nullable() @IsDateString() preferredVisitAt?: string | null;
}
export class CreateInternalEnquiryDto extends CreateEnquiryDto {
  @Nullable() @IsDateString() studentDob?: string | null;
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
  @Nullable() @IsUUID() assignedStaffId?: string | null;
  @Nullable() @IsDateString() nextFollowUpDate?: string | null;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
  @Nullable() @IsString() @MaxLength(160) previousSchool?: string | null;
  @IsOptional() @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"]) priority?: string;
  @Nullable() @IsString() @MaxLength(500) lostReason?: string | null;
  @IsOptional() @IsBoolean() allowDuplicate?: boolean;
  @Nullable() @IsString() @MaxLength(500) duplicateReason?: string | null;
}
export class UpdateEnquiryDto extends PartialType(CreateInternalEnquiryDto) {}
export class EnquiryQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(["ADMISSION", "CONTACT"]) purpose?: string;
  @IsOptional() @IsIn(["true", "false"]) openOnly?: "true" | "false";
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
  @IsOptional() @IsEnum(EnquirySource) source?: EnquirySource;
  @IsOptional() @IsUUID() assignedStaffId?: string;
  @IsOptional() @IsIn(["true", "false"]) followUpDue?: "true" | "false";
  @IsOptional() @IsIn(["true", "false"]) archived?: "true" | "false";
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsString() @MaxLength(60) interestedClass?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(["createdAt", "updatedAt", "parentName", "studentName", "nextFollowUpDate"]) sort?: string;
  @IsOptional() @IsIn(["asc", "desc"]) order?: "asc" | "desc";
}
export class CreateFollowUpDto {
  @IsIn(["CALL", "WHATSAPP", "EMAIL", "IN_PERSON", "PHONE"]) contactMethod!: string;
  @trim @IsString() @MinLength(2) @MaxLength(4000) notes!: string;
  @Nullable() @IsString() @MaxLength(80) staffName?: string;
  @Nullable() @IsString() @MaxLength(200) result?: string;
  @Nullable() @IsDateString() nextFollowUp?: string | null;
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
}
export class AssignmentDto { @IsUUID() assignedStaffId!: string; }
export class BulkAssignmentDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID(undefined, { each: true }) ids!: string[];
  @IsUUID() assignedStaffId!: string;
}
