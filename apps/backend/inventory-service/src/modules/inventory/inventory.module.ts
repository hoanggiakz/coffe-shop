import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryHealthController } from './inventory-health.controller';
import { InventorySpecController } from './inventory-spec.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController, InventoryHealthController, InventorySpecController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
