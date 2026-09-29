import { Module } from "@nestjs/common";
import { CmsController } from "./cms.controller";
import { CmsPublicController } from "./cms-public.controller";
import { CmsService } from "./cms.service";

@Module({ controllers: [CmsPublicController, CmsController], providers: [CmsService] })
export class CmsModule {}
