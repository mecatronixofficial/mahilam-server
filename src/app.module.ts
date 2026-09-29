import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicCacheModule } from "./common/cache/public-cache.service";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { AuthModule } from "./auth/auth.module";
import { EnquiriesModule } from "./enquiries/enquiries.module";
import { StudentsModule } from "./students/students.module";
import { CmsModule } from "./cms/cms.module";
import { AcademicsModule } from "./academics/academics.module";
import { AdmissionsModule } from "./admissions/admissions.module";
import { FeesModule } from "./fees/fees.module";
import { StaffModule } from "./staff/staff.module";
import { ReportsModule } from "./reports/reports.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { TasksModule } from "./tasks/tasks.module";
import { AppController } from "./app.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ name: "default", ttl: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000), limit: Number(process.env.RATE_LIMIT_MAX || 100) }]),
    ScheduleModule.forRoot(),
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
