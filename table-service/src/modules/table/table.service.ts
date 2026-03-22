import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaService } from '../../kafka/kafka.service';
import * as QRCode from 'qrcode';
import { CreateTableDto } from './dto/create-table.dto';
import { TableStatus } from '@prisma/client';

@Injectable()
export class TableService {
  constructor(
    private prisma: PrismaService,
    private kafkaService: KafkaService,
  ) {}

  async create(createTableDto: CreateTableDto) {
    // Check if table number exists
    const existing = await this.prisma.table.findUnique({
      where: { number: createTableDto.number },
    });
    if (existing) {
      throw new BadRequestException('Table number already exists');
    }

    // Generate QR code URL
    const qrUrl = `http://localhost:3000/menu?tableId=PLACEHOLDER`; // Frontend menu URL

    // Generate QR code base64
    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl);

    const table = await this.prisma.table.create({
      data: {
        number: createTableDto.number,
        capacity: createTableDto.capacity,
        qrCode: qrCodeDataUrl,
      },
    });

    return {
      ...table,
      qrCode: qrCodeDataUrl, // Return base64
    };
  }

  async findAll() {
    return this.prisma.table.findMany({
      orderBy: { number: 'asc' },
    });
  }

  async updateStatus(id: string, status: TableStatus) {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    const updated = await this.prisma.table.update({
      where: { id },
      data: { status },
    });

    return updated;
  }

  async callStaff(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    // Publish Kafka event
    await this.kafkaService.staffCalled({
      tableId: id,
      number: table.number,
    });

    return { message: 'Staff called successfully for table ' + table.number };
  }
}

