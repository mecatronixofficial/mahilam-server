import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ListQueryDto } from "../../common/dto/list-query.dto";

export class RangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class AuditQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) module?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
