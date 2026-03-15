import { IsBoolean } from 'class-validator';

export class UpdateMenuItemStatusDto {
  @IsBoolean()
  isAvailable: boolean;
}