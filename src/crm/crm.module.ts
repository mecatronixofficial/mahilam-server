import { Module } from "@nestjs/common";
import { CrmController } from "./crm.controller.js";
import { CrmService } from "./crm.service.js";
import { AdmissionsModule } from "../admissions/admissions.module.js";
import { EnquiriesModule } from "../enquiries/enquiries.module.js";
@Module({ imports: [AdmissionsModule, EnquiriesModule], controllers: [CrmController], providers: [CrmService] })
export class CrmModule {}
