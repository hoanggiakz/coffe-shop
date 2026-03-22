import { Module } from '@nestjs/common';
import { OptionController } from './option.controller';
import { OptionService } from './option.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { CommonModule } from '../../common/common.module';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [PrismaModule, KafkaModule, CommonModule, MenuModule],
  controllers: [OptionController],
  providers: [OptionService],
})
export class OptionModule {}
