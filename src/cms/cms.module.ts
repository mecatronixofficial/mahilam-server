import { Module } from "@nestjs/common";
import { CmsController } from "./cms.controller.js";
import { CmsPublicController } from "./cms-public.controller.js";
import { CmsService } from "./cms.service.js";

@Module({ controllers: [CmsPublicController, CmsController], providers: [CmsService] })
export class CmsModule {}
