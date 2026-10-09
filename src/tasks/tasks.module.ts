import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({ imports: [FeesModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
