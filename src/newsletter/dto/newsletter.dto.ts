import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";

export class SubscribeDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "Please enter a valid email address" })
  @MaxLength(160)
  email!: string;

  /** Honeypot: hidden from people, filled in by bots. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class UpdateSubscriberDto {
  @IsBoolean() active!: boolean;
}

export class SubscriberQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(["true", "false"]) active?: "true" | "false";
}
