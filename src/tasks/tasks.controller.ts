import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { timingSafeEqual } from "node:crypto";
import { TasksService } from "./tasks.service";

/** Lets Vercel Cron trigger the housekeeping jobs. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
@ApiExcludeController()
@Controller("tasks")
@SkipThrottle()
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get("run")
  async run(@Headers("authorization") authorization = "") {
    const secret = process.env.CRON_SECRET;
    const expected = Buffer.from(`Bearer ${secret}`);
    const actual = Buffer.from(authorization);
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
    return { success: true, data: await this.tasks.runAll() };
  }
}
