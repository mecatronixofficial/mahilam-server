import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 1000);

/** Logs method, path, status and duration; slow requests and server errors are logged as warnings. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
      if (res.statusCode >= 500 || ms >= SLOW_REQUEST_MS) this.logger.warn(line);
      else if (process.env.NODE_ENV !== "production") this.logger.log(line);
    });
    next();
  }
}
