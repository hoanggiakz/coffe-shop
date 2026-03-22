import { Global, Module } from '@nestjs/common';
import { CustomLogger } from './logger.service';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';

@Global()
@Module({
  providers: [
    CustomLogger,
    {
      provide: HttpExceptionFilter,
      useFactory: (logger: CustomLogger) => new HttpExceptionFilter(logger),
      inject: [CustomLogger],
    },
    {
      provide: 'CustomLogger',
      useClass: CustomLogger,
    },
  ],
  exports: [CustomLogger, HttpExceptionFilter],
})
export class CommonModule {}

