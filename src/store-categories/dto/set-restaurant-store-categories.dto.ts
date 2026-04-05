import { IsArray, IsUUID } from 'class-validator';

export class SetRestaurantStoreCategoriesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
