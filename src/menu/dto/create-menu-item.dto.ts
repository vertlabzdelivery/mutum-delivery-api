import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMenuItemDto {
  @IsUUID()
  restaurantId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}