import { Global, Module } from '@nestjs/common';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { CustomLogger } from './logger.service';

@Global()
@Module({
  providers: [
    CustomLogger,
    {
      provide: HttpExceptionFilter,
      useFactory: (logger: CustomLogger) => new HttpExceptionFilter(logger),
      inject: [CustomLogger],
    },
  ],
  exports: [CustomLogger, HttpExceptionFilter],
})
export class CommonModule {}
