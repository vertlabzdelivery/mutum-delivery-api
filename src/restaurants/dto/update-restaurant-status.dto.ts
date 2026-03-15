import { IsBoolean } from 'class-validator';

export class UpdateRestaurantStatusDto {
  @IsBoolean()
  isActive: boolean;
}