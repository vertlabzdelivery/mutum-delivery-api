import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  street: string;

  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsString()
  zipCode: string;

  @IsUUID()
  cityId: string;

  @IsUUID()
  neighborhoodId: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}