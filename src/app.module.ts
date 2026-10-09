import "./config/load-env.js";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env.validation.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PublicCacheModule } from "./common/cache/public-cache.service.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor.js";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware.js";
import { AuthModule } from "./auth/auth.module.js";
import { EnquiriesModule } from "./enquiries/enquiries.module.js";
import { StudentsModule } from "./students/students.module.js";
import { CmsModule } from "./cms/cms.module.js";
import { AcademicsModule } from "./academics/academics.module.js";
import { AdmissionsModule } from "./admissions/admissions.module.js";
import { FeesModule } from "./fees/fees.module.js";
import { StaffModule } from "./staff/staff.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { NewsletterModule } from "./newsletter/newsletter.module.js";
import { AppController } from "./app.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ name: "default", ttl: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000), limit: Number(process.env.RATE_LIMIT_MAX || 100) }]),
    // Vercel functions freeze between requests, so in-process timers never fire there; Vercel Cron calls /tasks/run instead.
    ...(process.env.VERCEL ? [] : [ScheduleModule.forRoot()]),
    PrismaModule,
    PublicCacheModule,
    IntegrationsModule,
    AuthModule,
    EnquiriesModule,
    StudentsModule,
    CmsModule,
    AcademicsModule,
    AdmissionsModule,
    FeesModule,
    StaffModule,
    ReportsModule,
    TasksModule,
    NewsletterModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
