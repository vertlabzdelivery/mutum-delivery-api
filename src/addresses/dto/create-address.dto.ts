import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(6)
  street: string;

  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsUUID()
  cityId: string;

  @IsUUID()
  neighborhoodId: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
