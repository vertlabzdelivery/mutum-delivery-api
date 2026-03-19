import { IsBoolean } from 'class-validator';

export class UpdateMenuCategoryStatusDto {
  @IsBoolean()
  isActive: boolean;
}
