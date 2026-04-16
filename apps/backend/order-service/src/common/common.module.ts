import { Global, Module } from '@nestjs/common';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { CustomLogger } from './logger.service';

@Global()
@Module({
  providers: [
    CustomLogger,
    {
      provide: 'CustomLogger',
      useClass: CustomLogger,
    },
    {
      provide: HttpExceptionFilter,
      useFactory: (logger: CustomLogger) => new HttpExceptionFilter(logger),
      inject: [CustomLogger],
    },
  ],
  exports: [CustomLogger, HttpExceptionFilter, 'CustomLogger'],
})
export class CommonModule {}
