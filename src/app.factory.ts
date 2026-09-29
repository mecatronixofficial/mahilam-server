import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { authCookieNames } from "./auth/auth.constants";

/** Builds the fully configured app. Shared by the long-running server (main.ts) and the Vercel function (serverless.ts). */
export async function createApp() {
  const isProduction = process.env.NODE_ENV === "production";
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });

  if (isProduction) app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
  app.disable("x-powered-by");
  app.setGlobalPrefix("api/v1");
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", extended: true });

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(compression({ threshold: 1024 }));
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.FRONTEND_URL || "http://localhost:3000").split(",").map((origin) => origin.trim()),
    credentials: true,
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, stopAtFirstError: false }));

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle("Little Mahilam API")
      .setDescription("Public website, CMS and CRM API. Sign in via POST /auth/login; the session is kept in HTTP-only cookies.")
      .setVersion("1.1")
      .addCookieAuth(authCookieNames().access)
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));
  }

  return app;
}
