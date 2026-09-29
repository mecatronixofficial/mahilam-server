import { PartialType } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { AdmissionStatus } from "../../generated/prisma/enums";
import { ListQueryDto } from "../../common/dto/list-query.dto";
import { Nullable } from "../../common/decorators/nullable.decorator";

export class CreateAdmissionDto {
  @IsString() @MinLength(2) @MaxLength(120) studentName!: string;
  @IsString() @MinLength(1) @MaxLength(60) className!: string;
  @Nullable() @IsUUID() enquiryId?: string | null;
  @Nullable() @IsDateString() joiningDate?: string | null;
  @IsOptional() @IsEnum(AdmissionStatus) status?: AdmissionStatus;
  @Nullable() @IsString() @MaxLength(4000) notes?: string | null;
}

export class UpdateAdmissionDto extends PartialType(CreateAdmissionDto) {}

export class AdmissionQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(AdmissionStatus) status?: AdmissionStatus;
}

/** Optional overrides when converting a confirmed admission into a student record. */
export class ConfirmAdmissionDto {
  @Nullable() @IsUUID() classLevelId?: string | null;
  @Nullable() @IsUUID() sectionId?: string | null;
  @Nullable() @IsDateString() joiningDate?: string | null;
}
