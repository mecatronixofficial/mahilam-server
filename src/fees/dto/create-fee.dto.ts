import { PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from "class-validator";
import { PaymentMethod, PaymentStatus } from "../../generated/prisma/enums.js";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";

const money = { maxDecimalPlaces: 2 };

export class CreateStudentFeeDto {
  @IsUUID() studentId!: string;
  @IsString() @MinLength(2) @MaxLength(120) label!: string;
  @Type(() => Number) @IsNumber(money) @Min(0) originalAmount!: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber(money) @Min(0) fine?: number;
  @Nullable() @IsDateString() dueDate?: string | null;
}

export class UpdateStudentFeeDto extends PartialType(CreateStudentFeeDto) {
  /** Status is derived from the amounts; the only manual override is waiving (or un-waiving) the fee. */
  @IsOptional() @IsBoolean() waive?: boolean;
}

export class FeeQueryDto extends ListQueryDto {
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsUUID() studentId?: string;
}

export class CreatePaymentDto {
  @IsUUID() studentFeeId!: string;
  @Type(() => Number) @IsNumber(money) @Min(0.01) amount!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @Nullable() @IsString() @MaxLength(500) notes?: string | null;
  @Nullable() @IsDateString() paidAt?: string | null;
}

export class PaymentQueryDto extends ListQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
}

export class VoidPaymentDto {
  @Nullable() @IsString() @MaxLength(500) reason?: string | null;
}

export class CreateFeeTypeDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateFeeTypeDto extends PartialType(CreateFeeTypeDto) {}

export class CreateFeeStructureDto {
  @IsUUID() feeTypeId!: string;
  @IsString() @MinLength(1) @MaxLength(60) className!: string;
  @IsString() @MinLength(4) @MaxLength(20) academicYear!: string;
  @Type(() => Number) @IsNumber(money) @Min(0) amount!: number;
  @Nullable() @IsDateString() dueDate?: string | null;
  @IsString() @MinLength(2) @MaxLength(30) frequency!: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
}

export class UpdateFeeStructureDto extends PartialType(CreateFeeStructureDto) {}
