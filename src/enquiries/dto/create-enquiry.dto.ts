import { PartialType } from "@nestjs/swagger";
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { EnquirySource, EnquiryStatus } from "../../generated/prisma/enums.js";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";
import { PHONE_MESSAGE, PHONE_PATTERN } from "../../common/validators.js";

/** Public website form. */
export class CreateEnquiryDto {
  @IsString() @MinLength(2) @MaxLength(80) parentName!: string;
  @IsString() @MinLength(2) @MaxLength(80) studentName!: string;
  @IsString() @Matches(PHONE_PATTERN, { message: `phone ${PHONE_MESSAGE}` }) phone!: string;
  @Nullable() @IsString() @Matches(PHONE_PATTERN, { message: `whatsapp ${PHONE_MESSAGE}` }) whatsapp?: string;
  @Nullable() @IsEmail() @MaxLength(160) email?: string;
  @IsString() @MinLength(1) @MaxLength(60) interestedClass!: string;
  @Nullable() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsEnum(EnquirySource) source?: EnquirySource;
}

/** Staff-created enquiry from the CRM. */
export class CreateInternalEnquiryDto extends CreateEnquiryDto {
  @Nullable() @IsDateString() studentDob?: string | null;
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
  @Nullable() @IsUUID() assignedStaffId?: string | null;
  @Nullable() @IsDateString() nextFollowUpDate?: string | null;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
}

export class UpdateEnquiryDto extends PartialType(CreateInternalEnquiryDto) {}

export class EnquiryQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
  @IsOptional() @IsEnum(EnquirySource) source?: EnquirySource;
  @IsOptional() @IsUUID() assignedStaffId?: string;
  /** Only enquiries whose next follow-up is due on or before today. */
  @IsOptional() @IsString() followUpDue?: "true" | "false";
}

export class CreateFollowUpDto {
  @IsString() @MinLength(2) @MaxLength(40) contactMethod!: string;
  @IsString() @MinLength(2) @MaxLength(4000) notes!: string;
  @Nullable() @IsString() @MaxLength(80) staffName?: string;
  @Nullable() @IsString() @MaxLength(200) result?: string;
  @Nullable() @IsDateString() nextFollowUp?: string | null;
  /** Optionally move the enquiry to a new stage in the same step. */
  @IsOptional() @IsEnum(EnquiryStatus) status?: EnquiryStatus;
}
