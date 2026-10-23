import { BadRequestException, Controller, Delete, Get, Header, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator.js";
import { BrandingService } from "./branding.service.js";
import { LOGO_TYPES, MAX_LOGO_BYTES } from "./logo-image.js";

@Controller("branding")
export class BrandingPublicController {
  constructor(private branding: BrandingService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async get() { return { success: true, data: await this.branding.publicSettings() }; }
}

@Controller("admin/branding")
@Auth("ADMIN", "SUPER_ADMIN", "CMS_EDITOR")
export class BrandingAdminController {
  constructor(private branding: BrandingService) {}
  @Post("logo")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_LOGO_BYTES, files: 1 }, fileFilter: (_req, file, cb) => cb(null, LOGO_TYPES.includes(file.mimetype)) }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Choose a PNG, JPEG or WebP logo up to 2 MB");
    return { success: true, data: await this.branding.replace(file) };
  }
  @Delete("logo")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async restore() { return { success: true, data: await this.branding.restore() }; }
}
