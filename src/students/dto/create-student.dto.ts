import { PartialType } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { StudentStatus } from "../../generated/prisma/enums";
import { ListQueryDto } from "../../common/dto/list-query.dto";
import { Nullable } from "../../common/decorators/nullable.decorator";
import { PHONE_MESSAGE, PHONE_PATTERN } from "../../common/validators";

export class CreateStudentDto {
  @IsString() @MinLength(2) @MaxLength(60) firstName!: string;
  @Nullable() @IsString() @MaxLength(60) lastName?: string | null;
  @Nullable() @IsDateString() dob?: string | null;
  @Nullable() @IsString() @MaxLength(20) gender?: string | null;
  @Nullable() @IsString() @MaxLength(10) bloodGroup?: string | null;
  @Nullable() @IsUrl({ require_tld: false }) @MaxLength(500) photoUrl?: string | null;
  @Nullable() @IsDateString() joiningDate?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN, { message: `phone ${PHONE_MESSAGE}` }) phone?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN, { message: `whatsapp ${PHONE_MESSAGE}` }) whatsapp?: string | null;
  @Nullable() @IsString() @MaxLength(500) address?: string | null;
  @Nullable() @IsString() @MaxLength(120) emergencyContact?: string | null;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @Nullable() @IsUUID() classLevelId?: string | null;
  @Nullable() @IsUUID() sectionId?: string | null;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class StudentQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @IsOptional() @IsUUID() classLevelId?: string;
  @IsOptional() @IsUUID() sectionId?: string;
}

export class CreateGuardianDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MinLength(2) @MaxLength(40) relationship!: string;
  @IsString() @Matches(PHONE_PATTERN, { message: `mobile ${PHONE_MESSAGE}` }) mobile!: string;
  @Nullable() @IsString() @Matches(PHONE_PATTERN, { message: `whatsapp ${PHONE_MESSAGE}` }) whatsapp?: string | null;
  @Nullable() @IsEmail() @MaxLength(160) email?: string | null;
  @Nullable() @IsString() @MaxLength(80) occupation?: string | null;
  @Nullable() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @IsBoolean() primary?: boolean;
}

export class UpdateGuardianDto extends PartialType(CreateGuardianDto) {}
