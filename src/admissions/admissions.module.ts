import { Module } from "@nestjs/common";
import { AdmissionsController } from "./admissions.controller.js";
import { AdmissionsService } from "./admissions.service.js";
@Module({ controllers: [AdmissionsController], providers: [AdmissionsService], exports: [AdmissionsService] })
export class AdmissionsModule {}
