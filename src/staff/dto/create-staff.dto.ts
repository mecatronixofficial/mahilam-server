import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { Role } from "../../generated/prisma/enums.js";
import { PASSWORD_MESSAGE, PASSWORD_RULE } from "../../auth/dto/login.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";

const normaliseEmail = Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value));
const STAFF_ROLES = [Role.STAFF, Role.ADMIN];

export class CreateStaffDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @normaliseEmail @IsEmail() @MaxLength(160) email!: string;
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password!: string;
  @IsOptional() @IsIn(STAFF_ROLES) role?: Role;
  /** Accepted for backwards compatibility; not stored. */
  @Nullable() @IsString() @MaxLength(80) designation?: string | null;
}

export class UpdateStaffDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @normaliseEmail @IsEmail() @MaxLength(160) email?: string;
  @Nullable() @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password?: string | null;
  @IsOptional() @IsIn(STAFF_ROLES) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}
