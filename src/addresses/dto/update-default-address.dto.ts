import { IsBoolean } from 'class-validator';

export class UpdateDefaultAddressDto {
  @IsBoolean()
  isDefault: boolean;
}