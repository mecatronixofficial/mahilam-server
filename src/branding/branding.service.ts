import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../integrations/storage.service.js";
import { decodeLogo } from "./logo-image.js";

export const BRANDING_KEY = "branding.logo";
type Logo = { logoUrl: string; key: string; width: number; height: number; contentType: string; originalFilename: string };

@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async publicSettings() {
    // Read live from DB: process-local caches cannot be invalidated across Vercel instances.
    const row = await this.prisma.siteSetting.findUnique({ where: { key: BRANDING_KEY } });
    const logo = row?.value as Logo | null;
    return { logoUrl: logo?.logoUrl ?? null, width: logo?.width ?? 694, height: logo?.height ?? 347, updatedAt: row?.updatedAt.toISOString() };
  }

  async replace(file: Express.Multer.File) {
    const image = await decodeLogo(file);
    const uploaded = await this.storage.uploadLogo(image.buffer);
    let previous: Logo | null = null;
    try {
      await this.storage.verifyLogo(uploaded.url);
      await this.prisma.$transaction(async (tx) => {
        // Serialize branding writes across serverless instances, including the first upload.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(76234109)`;
        const old = await tx.siteSetting.findUnique({ where: { key: BRANDING_KEY } });
        previous = old?.value as Logo | null;
        const value = { logoUrl: uploaded.url, key: uploaded.key, width: image.width, height: image.height, contentType: image.contentType, originalFilename: file.originalname.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) };
        await tx.siteSetting.upsert({ where: { key: BRANDING_KEY }, create: { key: BRANDING_KEY, value }, update: { value } });
      });
    } catch (error) { await this.cleanup(uploaded.key); throw error; }
    await this.cleanup((previous as Logo | null)?.key);
    return this.publicSettings();
  }

  async restore() {
    let previous: Logo | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(76234109)`;
      const old = await tx.siteSetting.findUnique({ where: { key: BRANDING_KEY } });
      previous = old?.value as Logo | null;
      await tx.siteSetting.deleteMany({ where: { key: BRANDING_KEY } });
    });
    await this.cleanup((previous as Logo | null)?.key);
    return this.publicSettings();
  }

  private async cleanup(key?: string) {
    if (!key) return;
    try { await this.storage.deleteLogo(key); }
    catch { this.logger.warn(`Logo cleanup failed for ${key}; active branding is unchanged. Retry deletion through storage maintenance.`); }
  }
}
