import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const TIME_GROUPS = ['day', 'week', 'month', 'year'] as const;
export type TimeGroup = (typeof TIME_GROUPS)[number];

export const EXPORT_REPORT_TYPES = ['revenue', 'top-items', 'inventory', 'staff-performance', 'dashboard'] as const;
export type ExportReportType = (typeof EXPORT_REPORT_TYPES)[number];

export const EXPORT_FORMATS = ['excel', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export class ReportRangeQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === undefined ? undefined : String(value).trim()))
  @IsString()
  branchId?: string;
}

export class RevenueReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsIn(TIME_GROUPS)
  groupBy?: TimeGroup;
}

export class TopItemsQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class InventoryReportQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeMovements?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  movementLimit?: number;
}

export class StaffPerformanceQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DashboardQueryDto extends ReportRangeQueryDto {
  @IsOptional()
  @IsIn(TIME_GROUPS)
  groupBy?: TimeGroup;
}

export class ExportReportQueryDto extends ReportRangeQueryDto {
  @IsIn(EXPORT_REPORT_TYPES)
  reportType: ExportReportType;

  @IsIn(EXPORT_FORMATS)
  format: ExportFormat;

  @IsOptional()
  @IsIn(TIME_GROUPS)
  groupBy?: TimeGroup;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeMovements?: boolean;
}
