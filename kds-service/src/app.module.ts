import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { ConfigModule as CustomConfigModule } from './config/config.module';
import { KafkaModule } from './kafka/kafka.module';
import { RedisModule } from './redis/redis.module';
import { KdsModule } from './modules/kds/kds.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    CustomConfigModule,
    KafkaModule,
    RedisModule,
    KdsModule,
  ],
})
export class AppModule {}

