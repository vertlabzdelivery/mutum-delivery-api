import { IsBoolean } from 'class-validator';

export class UpdateRestaurantDeliveryZoneStatusDto {
  @IsBoolean()
  isActive: boolean;
}