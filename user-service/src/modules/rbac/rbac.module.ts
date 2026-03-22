import { Module } from '@nestjs/common';
import { RBACService } from './rbac.service';

@Module({
  providers: [RBACService],
  exports: [RBACService],
})
export class RBACModule {}

