import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum TableActionMode {
  TRANSFER = 'TRANSFER',
  MERGE = 'MERGE',
}

export class TableActionDto {
  @IsString()
  @IsNotEmpty()
  fromTableId: string;

  @IsString()
  @IsNotEmpty()
  toTableId: string;

  @IsEnum(TableActionMode)
  mode: TableActionMode;
}
