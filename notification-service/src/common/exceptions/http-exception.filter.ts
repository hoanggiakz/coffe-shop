import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomLogger } from '../logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException 
      ? exception.getStatus() 
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse = exception instanceof HttpException
      ? exception.getResponse()
      : { 
          statusCode: status, 
          timestamp: new Date().toISOString(), 
          path: request.url, 
          message: 'Internal server error' 
        };

    this.logger.error(
      `${exception}`,
      `Method: ${request.method} | URL: ${request.url} | Status: ${status}`,
    );

    response.status(status).json(errorResponse);
  }
}

