import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class BillingReportQueryDto {
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;
}
