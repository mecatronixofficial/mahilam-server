import { PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { BlogStatus } from "../../generated/prisma/enums.js";
import { ListQueryDto } from "../../common/dto/list-query.dto.js";
import { Nullable } from "../../common/decorators/nullable.decorator.js";
import { slugify } from "../../common/utils/slug.js";
import { PHONE_MESSAGE, PHONE_PATTERN } from "../../common/validators.js";

/** Normalises whatever the admin typed ("My Album!") into a URL-safe slug ("my-album"). */
const Slug = () => Transform(({ value }) => (typeof value === "string" ? slugify(value) : value));
const Order = () => Type(() => Number);

// Images and links may be absolute URLs or site-relative paths such as "/admissions".
const MAX_URL = 1000;

export class AnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsString() @MinLength(2) @MaxLength(5000) content!: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @Order() @IsInt() @Min(-1000) @Max(1000) priority?: number;
  @Nullable() @IsString() @MaxLength(MAX_URL) imageUrl?: string | null;
  @Nullable() @IsString() @MaxLength(60) ctaLabel?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) ctaUrl?: string | null;
  @Nullable() @IsDateString() startDate?: string | null;
  @Nullable() @IsDateString() endDate?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateAnnouncementDto extends PartialType(AnnouncementDto) {}

export class BannerDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @Nullable() @IsString() @MaxLength(300) subtitle?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) desktopImage?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) mobileImage?: string | null;
  @Nullable() @IsString() @MaxLength(60) ctaLabel?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) ctaLink?: string | null;
  @Nullable() @IsString() @MaxLength(60) secondaryCtaLabel?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) secondaryCtaLink?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateBannerDto extends PartialType(BannerDto) {}

export class BlogDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @Slug() @IsString() @MinLength(1) @MaxLength(120) slug!: string;
  @Nullable() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsString() @MinLength(1) @MaxLength(200_000) content!: string;
  @Nullable() @IsString() @MaxLength(MAX_URL) coverImage?: string | null;
  @Nullable() @IsString() @MaxLength(80) author?: string | null;
  @Nullable() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];
  @Nullable() @IsString() @MaxLength(160) seoTitle?: string | null;
  @Nullable() @IsString() @MaxLength(320) seoDescription?: string | null;
  @IsOptional() @IsEnum(BlogStatus) status?: BlogStatus;
  @Nullable() @IsDateString() publishedAt?: string | null;
}
export class UpdateBlogDto extends PartialType(BlogDto) {}

export class TestimonialDto {
  @IsString() @MinLength(2) @MaxLength(80) parentName!: string;
  @Nullable() @IsString() @MaxLength(100) location?: string | null;
  @Nullable() @IsString() @MaxLength(100) studentReference?: string | null;
  @Nullable() @IsString() @MaxLength(120) subject?: string | null;
  @Nullable() @IsString() @Matches(PHONE_PATTERN, { message: `mobile ${PHONE_MESSAGE}` }) mobile?: string | null;
  @Nullable() @IsEmail() @MaxLength(160) email?: string | null;
  @IsOptional() @Order() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsString() @MinLength(10) @MaxLength(2000) testimonial!: string;
  @Nullable() @IsString() @MaxLength(MAX_URL) photo?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateTestimonialDto extends PartialType(TestimonialDto) {}

export class EventDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @Slug() @IsString() @MinLength(1) @MaxLength(120) slug!: string;
  @Nullable() @IsString() @MaxLength(MAX_URL) coverImage?: string | null;
  @Nullable() @IsString() @MaxLength(5000) description?: string | null;
  @IsDateString() startDate!: string;
  @Nullable() @IsDateString() endDate?: string | null;
  @Nullable() @IsString() @MaxLength(20) startTime?: string | null;
  @Nullable() @IsString() @MaxLength(160) venue?: string | null;
  @Nullable() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() featured?: boolean;
}
export class UpdateEventDto extends PartialType(EventDto) {}

export class GalleryAlbumDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @Slug() @IsString() @MinLength(1) @MaxLength(120) slug!: string;
  @Nullable() @IsString() @MaxLength(60) category?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateGalleryAlbumDto extends PartialType(GalleryAlbumDto) {}

export class GalleryItemDto {
  @IsUUID() albumId!: string;
  @IsString() @MinLength(1) @MaxLength(MAX_URL) imageUrl!: string;
  @Nullable() @IsString() @MaxLength(300) caption?: string | null;
  @Nullable() @IsString() @MaxLength(300) altText?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateGalleryItemDto extends PartialType(GalleryItemDto) {}

export class ProgramDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Slug() @IsString() @MinLength(1) @MaxLength(120) slug!: string;
  @Nullable() @IsString() @MaxLength(60) ageGroup?: string | null;
  @Nullable() @IsString() @MaxLength(1000) description?: string | null;
  @Nullable() @IsString() @MaxLength(20_000) detailedDescription?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) coverImage?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateProgramDto extends PartialType(ProgramDto) {}

export class FacilityDto {
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @Nullable() @IsString() @MaxLength(2000) description?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) image?: string | null;
  @Nullable() @IsString() @MaxLength(60) icon?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateFacilityDto extends PartialType(FacilityDto) {}

export class ActivityDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Slug() @IsString() @MinLength(1) @MaxLength(120) slug!: string;
  @Nullable() @IsString() @MaxLength(2000) description?: string | null;
  @Nullable() @IsString() @MaxLength(MAX_URL) image?: string | null;
  @Nullable() @IsString() @MaxLength(2000) benefits?: string | null;
  @IsOptional() @Order() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateActivityDto extends PartialType(ActivityDto) {}

export class SettingDto {
  @IsString() @Matches(/^[a-zA-Z0-9_.-]{2,80}$/, { message: "key may only contain letters, numbers, dots, dashes and underscores" }) key!: string;
  @IsDefined() value!: unknown;
}

export class BlogQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(40) tag?: string;
}

export class EventQueryDto {
  /** `upcoming` (default for the public site is all active events), or `past`. */
  @IsOptional() @IsString() @Matches(/^(upcoming|past)$/) when?: "upcoming" | "past";
}
