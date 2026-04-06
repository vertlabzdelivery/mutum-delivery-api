import { IsOptional, IsString, MinLength } from "class-validator";

export class ConfirmPhoneVerificationDto {
  @IsOptional()
  @IsString()
  verificationId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @MinLength(4)
  code: string;
}
