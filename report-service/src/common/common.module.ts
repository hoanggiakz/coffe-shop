import { Global, Module } from '@nestjs/common';
import { CustomLogger } from './logger.service';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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
    JwtAuthGuard,
  ],
  exports: [CustomLogger, HttpExceptionFilter, JwtAuthGuard, 'CustomLogger'],
})
export class CommonModule {}

