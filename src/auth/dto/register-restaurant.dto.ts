import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class RegisterRestaurantDto {
  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsString()
  @MinLength(2)
  restaurantName: string;

  @IsOptional()
  @IsString()
  restaurantDescription?: string;

  @IsOptional()
  @IsString()
  restaurantLogoUrl?: string;

  @IsOptional()
  @IsString()
  restaurantBannerUrl?: string;

  @IsOptional()
  @IsString()
  restaurantPhone?: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;
}