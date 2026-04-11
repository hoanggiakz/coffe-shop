import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RBACModule } from './modules/rbac/rbac.module';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    PrismaModule,
    KafkaModule,
    AuthModule,
    UserModule,
    RBACModule,
  ],
})
export class AppModule {}

