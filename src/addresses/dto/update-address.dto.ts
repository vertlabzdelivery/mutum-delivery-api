import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  street?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  neighborhoodId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
