import { IsString, MinLength } from 'class-validator';

export class ConfirmPasswordRecoveryDto {
  @IsString()
  sessionId: string;

  @IsString()
  @MinLength(4)
  code: string;
}
