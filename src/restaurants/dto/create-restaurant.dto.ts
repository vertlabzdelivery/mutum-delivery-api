import {
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  address: string;

  @IsUUID()
  ownerId: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}