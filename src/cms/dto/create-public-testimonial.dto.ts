import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class CreatePublicTestimonialDto {
  @IsString() @MinLength(2) @MaxLength(80) parentName!: string;
  @IsString() @MinLength(2) @MaxLength(100) location!: string;
  @IsString() @Matches(/^[0-9+()\-\s]{7,20}$/) mobile!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(3) @MaxLength(120) subject!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(10) @MaxLength(1000) testimonial!: string;
}
