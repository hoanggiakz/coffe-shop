import { Module, Global, DynamicModule } from '@nestjs/common';
import { CustomLogger } from './logger.service';

@Global()
@Module({})
export class LoggerModule {
  static forRoot(): DynamicModule {
    return {
      module: LoggerModule,
      providers: [CustomLogger],
      exports: [CustomLogger],
    };
  }
}
