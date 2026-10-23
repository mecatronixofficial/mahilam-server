import { Transform } from "class-transformer";
import { PartialType } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { AdmissionStatus } from "../../generated/prisma/enums.js";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";
import { PHONE_PATTERN } from "../../common/validators.js";
export class CreateAdmissionDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(120) studentName!: string;
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(60) className!: string;
  @Nullable() @IsUUID() enquiryId?: string | null;
  @Nullable() @IsDateString() joiningDate?: string | null;
  @IsOptional() @IsEnum(AdmissionStatus) status?: AdmissionStatus;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
  @Nullable() @IsUUID() academicYearId?: string | null;
  @Nullable() @IsUUID() classLevelId?: string | null;
  @Nullable() @IsDateString() childDob?: string | null;
  @Nullable() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(80) parentName?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN) phone?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN) alternatePhone?: string | null;
  @Nullable() @IsEmail() @MaxLength(160) email?: string | null;
  @Nullable() @IsString() @MaxLength(500) address?: string | null;
  @Nullable() @IsString() @MaxLength(200) emergencyContact?: string | null;
  @Nullable() @IsString() @MaxLength(160) previousSchool?: string | null;
  @IsOptional() @IsBoolean() consent?: boolean;
}
export class UpdateAdmissionDto extends PartialType(CreateAdmissionDto) {}
export class AdmissionQueryDto extends ListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() assignedStaffId?: string;
  @IsOptional() @IsString() @MaxLength(60) program?: string;
  @IsOptional() @IsEnum(AdmissionStatus) status?: AdmissionStatus;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsOptional() @IsIn(["true", "false"]) archived?: "true" | "false";
}
export class ConfirmAdmissionDto {
  @Nullable() @IsUUID() classLevelId?: string | null;
  @Nullable() @IsUUID() sectionId?: string | null;
  @Nullable() @IsUUID() guardianId?: string | null;
  @Nullable() @IsDateString() joiningDate?: string | null;
  @IsOptional() @IsBoolean() capacityOverride?: boolean;
  @Nullable() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MinLength(5) @MaxLength(500) overrideReason?: string | null;
}
export class ReviewAdmissionDto {
  @IsIn(["APPROVED", "REJECTED", "WAITLISTED"]) decision!: "APPROVED" | "REJECTED" | "WAITLISTED";
  @Nullable() @IsString() @MaxLength(1000) reason?: string | null;
}
