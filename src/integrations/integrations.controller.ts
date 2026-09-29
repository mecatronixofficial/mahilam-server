import { BadRequestException, Controller, Get, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AdminOnly, Auth } from "../common/decorators/auth.decorator";
import { NotificationsService } from "./notifications.service";
import { MAX_IMAGE_BYTES, StorageService } from "./storage.service";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

@ApiTags("integrations")
@Controller("integrations")
export class IntegrationsController {
  constructor(
    private storage: StorageService,
    private notifications: NotificationsService,
  ) {}

  @Get("status")
  @AdminOnly()
  status() {
    return { success: true, data: { cloudflareR2: this.storage.status(), ...this.notifications.status() } };
  }

  @Post("uploads/image")
  @Auth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 }, fileFilter: (_req, file, callback) => callback(null, IMAGE_TYPES.includes(file.mimetype)) }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Choose a JPEG, PNG, WebP, or GIF image up to 5 MB");
    return { success: true, message: "Image uploaded", data: await this.storage.uploadImage(file) };
  }
}
