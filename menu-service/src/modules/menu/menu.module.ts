import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, KafkaModule, CommonModule, CacheModule.register()],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}
