import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';
import { ReportsController } from './reports.controller';
import { ReportsHealthController } from './reports-health.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [ReportsController, ReportsHealthController],
  providers: [ReportsService],
})
export class ReportsModule {}

