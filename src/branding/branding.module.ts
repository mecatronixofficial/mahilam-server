import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { BrandingAdminController, BrandingPublicController } from "./branding.controller.js";
import { BrandingService } from "./branding.service.js";

@Module({ imports: [IntegrationsModule], controllers: [BrandingPublicController, BrandingAdminController], providers: [BrandingService] })
export class BrandingModule {}
