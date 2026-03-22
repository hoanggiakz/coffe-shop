import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KafkaService } from './kafka.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}
