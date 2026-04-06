import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreatePromotionalCouponDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'code deve conter apenas letras e números' })
  code: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  discountPercent: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
