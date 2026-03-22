import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { KdsService } from './kds.service';
import { KdsGateway } from './kds.gateway';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [CommonModule, RedisModule],
  providers: [KdsService, KdsGateway],
  exports: [KdsService],
})
export class KdsModule {}
