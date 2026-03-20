import { IsDateString, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class SaveBillingCycleDto {
  @IsUUID()
  restaurantId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  notes?: string;
}
