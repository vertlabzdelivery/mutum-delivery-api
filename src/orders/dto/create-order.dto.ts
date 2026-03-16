import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

class CreateOrderItemSelectionDto {
  @IsString()
  choiceName: string;

  @IsOptional()
  @IsNumber()
  price?: number;
}

class CreateOrderItemDto {
  @IsUUID()
  menuItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemSelectionDto)
  selections?: CreateOrderItemSelectionDto[];
}

export class CreateOrderDto {
  @IsUUID()
  restaurantId: string;

  @IsUUID()
  userAddressId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  deliveryName: string;

  @IsString()
  deliveryPhone: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}