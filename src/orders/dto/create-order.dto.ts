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

class CreateOrderItemSelectedChoiceDto {
  @IsUUID()
  optionId: string;

  @IsUUID()
  choiceId: string;
}

class CreateOrderItemDto {
  @IsUUID()
  menuItemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemSelectedChoiceDto)
  selectedChoices?: CreateOrderItemSelectedChoiceDto[];
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  cashChangeFor?: number;

  @IsString()
  deliveryName: string;

  @IsString()
  deliveryPhone: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export { CreateOrderItemDto, CreateOrderItemSelectedChoiceDto };
