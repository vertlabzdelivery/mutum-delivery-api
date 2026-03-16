import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateRestaurantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}