import { IsNumber, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'couponCode deve conter apenas letras e números' })
  couponCode: string;

  @IsUUID()
  restaurantId: string;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;
}
