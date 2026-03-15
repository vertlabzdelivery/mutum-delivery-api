import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
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

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  deliveryName: string;

  @IsString()
  deliveryPhone: string;

  @IsString()
  deliveryStreet: string;

  @IsString()
  deliveryNumber: string;

  @IsString()
  deliveryDistrict: string;

  @IsString()
  deliveryCity: string;

  @IsString()
  deliveryState: string;

  @IsString()
  deliveryZipCode: string;

  @IsOptional()
  @IsString()
  deliveryComplement?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}