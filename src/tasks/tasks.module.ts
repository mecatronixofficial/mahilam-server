import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module";
import { TasksService } from "./tasks.service";

@Module({ imports: [FeesModule], providers: [TasksService] })
export class TasksModule {}
