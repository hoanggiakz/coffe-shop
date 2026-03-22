import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CustomLogger } from '../../common/logger.service';
import { KafkaService } from '../../kafka/kafka.service';

@Injectable()
export class CategoryService {
  constructor(
    private prisma: PrismaService,
    @Inject('CustomLogger') private logger: CustomLogger,
    private kafkaService: KafkaService,
  ) {}

  async findAll() {
    return this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    return category;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data: createCategoryDto,
    });
    await this.kafkaService.menuUpdated({
      action: 'CREATE',
      entity: 'CATEGORY',
      data: category,
    });
    this.logger.log(`Created category ${category.name}`);
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id); // validate exists
    const category = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });
    await this.kafkaService.menuUpdated({
      action: 'UPDATE',
      entity: 'CATEGORY',
      data: category,
    });
    this.logger.log(`Updated category ${category.id}`);
    return category;
  }

  async remove(id: string) {
    await this.findOne(id); // validate exists
    await this.prisma.category.delete({ where: { id } });
    await this.kafkaService.menuUpdated({
      action: 'DELETE',
      entity: 'CATEGORY',
      data: { id },
    });
    this.logger.log(`Deleted category ${id}`);
  }
}
