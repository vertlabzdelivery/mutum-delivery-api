import { IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';

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

  @IsString()
  ownerId: string;
}