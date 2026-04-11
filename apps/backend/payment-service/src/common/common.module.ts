import { Global, Module } from '@nestjs/common';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { CustomLogger } from './logger.service';
import { LoggerModule } from './logger.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Global()
@Module({
  imports: [LoggerModule],
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
  exports: [CustomLogger, HttpExceptionFilter, JwtAuthGuard],
})
export class CommonModule {}
