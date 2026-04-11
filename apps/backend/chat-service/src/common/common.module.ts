import { Global, Module } from '@nestjs/common';
import { LoggerModule } from './logger.module';

@Global()
@Module({
  imports: [LoggerModule],
  exports: [LoggerModule],
})
export class CommonModule {}
