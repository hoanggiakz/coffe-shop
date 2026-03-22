import { Global, Module } from '@nestjs/common';
import { HttpExceptionFilter } from './exceptions/http-exception.filter';
import { CustomLogger } from './logger.service';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Global()
@Module({
  providers: [
    CustomLogger,
    RolesGuard,
    PermissionsGuard,
    JwtAuthGuard,
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
  exports: [CustomLogger, HttpExceptionFilter, RolesGuard, PermissionsGuard, JwtAuthGuard],
})
export class CommonModule {}

