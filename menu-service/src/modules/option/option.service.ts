import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { CustomLogger } from '../../common/logger.service';
import { KafkaService } from '../../kafka/kafka.service';
import { Cache } from 'cache-manager';

@Injectable()
export class OptionService {
  constructor(
    private prisma: PrismaService,
    @Inject('CustomLogger') private logger: CustomLogger,
    private kafkaService: KafkaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // OptionGroup methods
  async createOptionGroup(createOptionGroupDto: CreateOptionGroupDto) {
    const optionGroup = await this.prisma.optionGroup.create({
      data: createOptionGroupDto,
      include: {
        optionValues: true,
      },
    });
    await this.kafkaService.menuUpdated({
      action: 'CREATE',
      entity: 'OPTION_GROUP',
      data: optionGroup,
    });
    await this.cacheManager.del('menu_list'); // Invalidate
    this.logger.log(`Created option group ${optionGroup.name}`);
    return optionGroup;
  }

  async findOptionGroups(menuItemId?: string) {
    return this.prisma.optionGroup.findMany({
      where: menuItemId ? { menuItemId } : {},
      include: {
        optionValues: true,
      },
    });
  }

  async updateOptionGroup(id: string, data: any) {
    const optionGroup = await this.prisma.optionGroup.update({
      where: { id },
      data,
    });
    await this.kafkaService.menuUpdated({
      action: 'UPDATE',
      entity: 'OPTION_GROUP',
      data: optionGroup,
    });
    await this.cacheManager.del('menu_list');
    return optionGroup;
  }

  async deleteOptionGroup(id: string) {
    await this.prisma.optionGroup.delete({ where: { id } });
    await this.kafkaService.menuUpdated({
      action: 'DELETE',
      entity: 'OPTION_GROUP',
      data: { id },
    });
    await this.cacheManager.del('menu_list');
  }

  // OptionValue methods
  async createOptionValue(createOptionValueDto: CreateOptionValueDto) {
    const optionValue = await this.prisma.optionValue.create({
      data: createOptionValueDto,
    });
    await this.kafkaService.menuUpdated({
      action: 'CREATE',
      entity: 'OPTION_VALUE',
      data: optionValue,
    });
    await this.cacheManager.del('menu_list');
    this.logger.log(`Created option value ${optionValue.name}`);
    return optionValue;
  }

  async findOptionValues(groupId: string) {
    return this.prisma.optionValue.findMany({
      where: { groupId },
    });
  }

  async updateOptionValue(id: string, data: any) {
    const optionValue = await this.prisma.optionValue.update({
      where: { id },
      data,
    });
    await this.kafkaService.menuUpdated({
      action: 'UPDATE',
      entity: 'OPTION_VALUE',
      data: optionValue,
    });
    await this.cacheManager.del('menu_list');
    return optionValue;
  }

  async deleteOptionValue(id: string) {
    await this.prisma.optionValue.delete({ where: { id } });
    await this.kafkaService.menuUpdated({
      action: 'DELETE',
      entity: 'OPTION_VALUE',
      data: { id },
    });
    await this.cacheManager.del('menu_list');
  }
}
