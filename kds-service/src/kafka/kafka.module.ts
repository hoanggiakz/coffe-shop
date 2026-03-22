import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { KafkaService } from './kafka.service';

@Global()
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
