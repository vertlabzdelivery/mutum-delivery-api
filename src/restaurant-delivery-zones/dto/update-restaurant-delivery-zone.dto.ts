import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateRestaurantDeliveryZoneDto {
  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minTime?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTime?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}