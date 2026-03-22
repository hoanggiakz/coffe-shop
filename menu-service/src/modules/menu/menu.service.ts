import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CustomLogger } from '../../common/logger.service';
import { KafkaService } from '../../kafka/kafka.service';
import { Cache } from 'cache-manager';

@Injectable()
export class MenuService {
  constructor(
    private prisma: PrismaService,
    @Inject('CustomLogger') private logger: CustomLogger,
    private kafkaService: KafkaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async findAll() {
    // Try cache first
    let menuList = await this.cacheManager.get('menu_list');
    if (menuList) {
      this.logger.log('Menu list served from cache');
      return menuList;
    }

    const menuItems = await this.prisma.menuItem.findMany({
      include: {
        category: {
          select: { id: true, name: true },
        },
        optionGroups: {
          include: {
            optionValues: true,
          },
        },
      },
      orderBy: [
        { category: { name: 'asc' } },
        { name: 'asc' },
      ],
    });

    // Cache for 300s
    await this.cacheManager.set('menu_list', menuItems, 300);
    this.logger.log('Menu list served from DB and cached');
    return menuItems;
  }

  async findOne(id: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        category: true,
        optionGroups: {
          include: {
            optionValues: true,
          },
        },
      },
    });
    if (!menuItem) {
      throw new NotFoundException(`Menu item with id ${id} not found`);
    }
    return menuItem;
  }

  async create(createMenuItemDto: CreateMenuItemDto) {
    const menuItem = await this.prisma.menuItem.create({
      data: createMenuItemDto,
      include: {
        category: true,
      },
    });
    await this.kafkaService.menuUpdated({
      action: 'CREATE',
      entity: 'MENU_ITEM',
      data: menuItem,
    });
    await this.cacheManager.del('menu_list'); // Invalidate cache
    this.logger.log(`Created menu item ${menuItem.name}`);
    return menuItem;
  }

  async update(id: string, updateMenuItemDto: UpdateMenuItemDto) {
    await this.findOne(id); // validate exists
    const menuItem = await this.prisma.menuItem.update({
      where: { id },
      data: updateMenuItemDto,
      include: {
        category: true,
      },
    });
    await this.kafkaService.menuUpdated({
      action: 'UPDATE',
      entity: 'MENU_ITEM',
      data: menuItem,
    });
    await this.cacheManager.del('menu_list');
    this.logger.log(`Updated menu item ${menuItem.id}`);
    return menuItem;
  }

  async remove(id: string) {
    await this.findOne(id); // validate exists
    await this.prisma.menuItem.delete({ where: { id } });
    await this.kafkaService.menuUpdated({
      action: 'DELETE',
      entity: 'MENU_ITEM',
      data: { id },
    });
    await this.cacheManager.del('menu_list');
    this.logger.log(`Deleted menu item ${id}`);
  }
}
