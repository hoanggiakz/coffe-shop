import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module';

@Module({
  imports: [LoggerModule.forRoot()],
  exports: [LoggerModule],
})
export class CommonModule {}
