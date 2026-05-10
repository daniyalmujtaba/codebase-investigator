import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      return res.status(status).json(typeof body === "string" ? { message: body } : body);
    }
    if (exception instanceof ZodError) {
      return res.status(400).json({ message: "validation error", issues: exception.issues });
    }
    const msg = (exception as Error)?.message ?? "internal error";
    if (/not found/i.test(msg)) return res.status(404).json({ message: msg });
    if (/forbidden/i.test(msg)) return res.status(403).json({ message: msg });
    this.log.error(msg);
    return res.status(500).json({ message: "internal error" });
  }
}
