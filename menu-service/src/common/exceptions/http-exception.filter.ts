import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CustomLogger } from '../logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Log error
    this.logger.error(
      `${request.method} ${request.url}`,
      JSON.stringify({
        status,
        message,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
        ...(exception instanceof Error ? { stack: exception.stack } : {}),
      }),
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string'
        ? message
        : (message && typeof (message as { message?: unknown }).message === 'string'
          ? (message as { message: string }).message
          : JSON.stringify(message)),
    });
  }
}
