import { IsString, MinLength } from 'class-validator';

export class StartPasswordRecoveryDto {
  @IsString()
  @MinLength(10)
  phone: string;
}
