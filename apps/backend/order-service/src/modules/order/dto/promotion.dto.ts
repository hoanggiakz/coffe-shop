import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DiscountType, PromotionScope } from '@prisma/client';

export class CreatePromotionDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsEnum(DiscountType)
  discountType: DiscountType;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000000)
  discountValue: number;

  @IsOptional()
  @IsEnum(PromotionScope)
  appliesTo?: PromotionScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  menuItemIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchId?: string;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000000)
  discountValue?: number;

  @IsOptional()
  @IsEnum(PromotionScope)
  appliesTo?: PromotionScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  menuItemIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDiscount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchId?: string;
}

export class QueryPromotionDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  includeInactive?: string;

  @IsOptional()
  @IsEnum(PromotionScope)
  appliesTo?: PromotionScope;

  @IsOptional()
  @IsString()
  branchId?: string;
}
