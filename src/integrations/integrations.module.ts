import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { StorageService } from "./storage.service.js";

@Module({
  controllers: [IntegrationsController],
  providers: [NotificationsService, StorageService],
  exports: [NotificationsService, StorageService],
})
export class IntegrationsModule {}
