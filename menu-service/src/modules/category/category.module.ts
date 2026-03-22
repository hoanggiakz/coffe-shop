import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, KafkaModule, CommonModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}
