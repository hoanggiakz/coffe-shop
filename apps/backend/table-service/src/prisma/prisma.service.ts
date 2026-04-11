import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CustomLogger } from '../common/logger.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject('CustomLogger') private readonly logger: CustomLogger) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}

