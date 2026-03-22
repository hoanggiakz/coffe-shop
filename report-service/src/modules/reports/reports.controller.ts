import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  DashboardQueryDto,
  ExportReportQueryDto,
  InventoryReportQueryDto,
  RevenueReportQueryDto,
  StaffPerformanceQueryDto,
  TopItemsQueryDto,
} from './dto/report-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  @ApiOperation({ summary: 'M-19 Revenue report by date range and period' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'] })
  @ApiResponse({ status: 200 })
  async getRevenue(@Query() query: RevenueReportQueryDto) {
    return this.reportsService.getRevenueReport(query);
  }

  @Get('top-items')
  @ApiOperation({ summary: 'M-20 Top selling items in a period' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200 })
  async getTopItems(@Query() query: TopItemsQueryDto) {
    return this.reportsService.getTopItems(query);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'M-21 Inventory report: current stock and movement history' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiQuery({ name: 'includeMovements', required: false, example: true })
  @ApiQuery({ name: 'movementLimit', required: false, example: 300 })
  @ApiResponse({ status: 200 })
  async getInventory(@Query() query: InventoryReportQueryDto) {
    return this.reportsService.getInventoryReport(query);
  }

  @Get('staff-performance')
  @ApiOperation({ summary: 'M-22 Staff performance report' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200 })
  async getStaffPerformance(@Query() query: StaffPerformanceQueryDto) {
    return this.reportsService.getStaffPerformance(query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'M-23 Visual dashboard data (revenue, orders, inventory)' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'] })
  @ApiResponse({ status: 200 })
  async getDashboard(@Query() query: DashboardQueryDto) {
    return this.reportsService.getDashboard(query);
  }

  @Get('daily-stats')
  @ApiOperation({ summary: 'Backward-compatible daily dashboard stats' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiResponse({ status: 200 })
  async getDailyStats(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.reportsService.getDailyStats(dateFrom, dateTo);
  }

  @Get('export')
  @ApiOperation({ summary: 'M-19/M-21/M-22 export report to Excel or PDF' })
  @ApiQuery({ name: 'reportType', required: true, enum: ['revenue', 'top-items', 'inventory', 'staff-performance', 'dashboard'] })
  @ApiQuery({ name: 'format', required: true, enum: ['excel', 'pdf'] })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-03-01' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-03-31' })
  @ApiResponse({ status: 200, description: 'File stream' })
  async exportReport(@Query() query: ExportReportQueryDto, @Res() res: Response) {
    const exported = await this.reportsService.exportReport(query);
    res.setHeader('Content-Type', exported.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return res.send(exported.buffer);
  }
}

