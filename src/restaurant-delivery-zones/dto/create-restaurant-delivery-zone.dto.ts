import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateRestaurantDeliveryZoneDto {
  @IsUUID()
  restaurantId: string;

  @IsUUID()
  neighborhoodId: string;

  @IsNumber()
  @Min(0)
  deliveryFee: number;

  @IsInt()
  @Min(1)
  minTime: number;

  @IsInt()
  @Min(1)
  maxTime: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}