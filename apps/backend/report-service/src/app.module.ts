import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    PrismaModule,
    KafkaModule,
    ReportsModule,
  ],
  controllers: [MetricsController],
})
export class AppModule {}

