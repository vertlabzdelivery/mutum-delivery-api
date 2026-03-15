import { IsString, IsUUID } from 'class-validator';

export class CreateNeighborhoodDto {
  @IsString()
  name: string;

  @IsUUID()
  cityId: string;
}