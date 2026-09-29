import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({ imports: [FeesModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
