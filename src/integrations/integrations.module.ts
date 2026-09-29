import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { NotificationsService } from "./notifications.service";
import { StorageService } from "./storage.service";

@Module({
  controllers: [IntegrationsController],
  providers: [NotificationsService, StorageService],
  exports: [NotificationsService, StorageService],
})
export class IntegrationsModule {}
