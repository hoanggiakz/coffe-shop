import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { TableService } from './table.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableStatusDto } from './dto/update-table-status.dto';

@ApiTags('Tables')
@Controller('tables')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  @ApiOperation({ summary: 'Create new table with QR code' })
  @ApiResponse({ status: 201, description: 'Table created.' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTableDto: CreateTableDto) {
    return this.tableService.create(createTableDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tables' })
  @ApiResponse({ status: 200, description: 'Tables list.' })
  findAll() {
    return this.tableService.findAll();
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update table status' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateTableStatusDto })
  updateStatus(@Param('id') id: string, @Body() updateStatusDto: UpdateTableStatusDto) {
    return this.tableService.updateStatus(id, updateStatusDto.status);
  }

  @Post(':id/call-staff')
  @ApiOperation({ summary: 'Call staff for table' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Staff called.' })
  @HttpCode(HttpStatus.OK)
  callStaff(@Param('id') id: string) {
    return this.tableService.callStaff(id);
  }
}

