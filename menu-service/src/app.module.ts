import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { CategoryModule } from './modules/category/category.module';
import { MenuModule } from './modules/menu/menu.module';
import { OptionModule } from './modules/option/option.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    PrismaModule,
    KafkaModule,
    CategoryModule,
    MenuModule,
    OptionModule,
  ],
})
export class AppModule {}
