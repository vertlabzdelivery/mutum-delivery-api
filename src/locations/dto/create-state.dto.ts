import { IsString, Length } from 'class-validator';

export class CreateStateDto {
  @IsString()
  name: string;

  @IsString()
  @Length(2, 2)
  code: string;
}