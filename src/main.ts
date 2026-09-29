import { Logger } from "@nestjs/common";
import { createApp } from "./app.factory";

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === "production";
  const app = await createApp();
  const port = Number(process.env.PORT || 4000);

  app.enableShutdownHooks();
  await app.listen(port);
  new Logger("Bootstrap").log(`API running on http://localhost:${port}/api/v1${isProduction ? "" : ` (docs: http://localhost:${port}/api/docs)`}`);
}

bootstrap();
