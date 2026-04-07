import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateRestaurantPaymentMethodsDto {
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  paymentMethodIds?: string[];
}
