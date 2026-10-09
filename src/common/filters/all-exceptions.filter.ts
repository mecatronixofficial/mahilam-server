import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * Normalises every error to `{ success:false, statusCode, message, errors? }`.
 * `message` is always a string so clients can show it directly; Prisma errors map to 4xx instead of 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, message, errors } = this.resolve(exception);

    if (status >= 500) this.logger.error(`${req.method} ${req.originalUrl}: ${exception instanceof Error ? exception.stack : String(exception)}`);
    if (res.headersSent) return;
    res.status(status).json({ success: false, statusCode: status, message, ...(errors ? { errors } : {}) });
  }

  private resolve(exception: unknown): { status: number; message: string; errors?: string[] } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === "string" ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      if (Array.isArray(raw)) return { status, message: raw.join("; "), errors: raw };
      return { status, message: raw };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P1000":
        case "P1001":
        case "P1002":
        case "P1017":
          return { status: HttpStatus.SERVICE_UNAVAILABLE, message: "Database is unavailable. Please try again later." };
        case "P2002": {
          const target = (exception.meta as { target?: string[] | string } | undefined)?.target;
          const fields = Array.isArray(target) ? target.join(", ") : target;
          return { status: HttpStatus.CONFLICT, message: fields ? `A record with this ${fields} already exists` : "This record already exists" };
        }
        case "P2025":
          return { status: HttpStatus.NOT_FOUND, message: "Record not found" };
        case "P2003":
          return { status: HttpStatus.CONFLICT, message: "This record is linked to other records and cannot be changed or removed" };
        case "P2000":
          return { status: HttpStatus.BAD_REQUEST, message: "A value is too long for its field" };
      }
    }
    if (exception instanceof Prisma.PrismaClientValidationError) return { status: HttpStatus.BAD_REQUEST, message: "Invalid data for this request" };

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: "Something went wrong. Please try again." };
  }
}
