import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Nullable } from "../../common/decorators/nullable.decorator.js";

export class CreateAcademicYearDto {
  @IsString() @Matches(/^\d{4}-\d{4}$/, { message: "name must look like 2026-2027" }) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsBoolean() current?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateAcademicYearDto extends PartialType(CreateAcademicYearDto) {}

export class CreateClassLevelDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsString() @Matches(/^[A-Z0-9-]{1,30}$/, { message: "code may only contain uppercase letters, numbers and hyphens" }) code!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @Nullable() @IsUUID() academicYearId?: string | null;
}

export class UpdateClassLevelDto extends PartialType(CreateClassLevelDto) {}

export class CreateSectionDto {
  @IsUUID() classLevelId!: string;
  @IsString() @MinLength(1) @MaxLength(30) name!: string;
  @Nullable() @Type(() => Number) @IsInt() @Min(1) @Max(500) capacity?: number | null;
  @Nullable() @IsString() @MaxLength(40) room?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSectionDto extends PartialType(CreateSectionDto) {}
