import { Injectable, LoggerService, Scope, Optional, Inject } from '@nestjs/common';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable({ scope: Scope.TRANSIENT })
export class CustomLogger implements LoggerService {
  private context: string;
  private logger: winston.Logger;

  constructor(@Optional() context?: string) {
    this.context = context;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: 'chat-service' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'error',
        }),
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });
  }

  log(message: string) {
    this.logger.info(message, this.getContext());
  }

  error(message: string, trace = 'N/A') {
    this.logger.error(message, { ...this.getContext(), trace });
  }

  warn(message: string) {
    this.logger.warn(message, this.getContext());
  }

  debug(message: string) {
    this.logger.debug(message, this.getContext());
  }

  verbose(message: string) {
    this.logger.verbose(message, this.getContext());
  }

  private getContext() {
    return { context: this.context };
  }

  setContext(context: string) {
    this.context = context;
  }
}
