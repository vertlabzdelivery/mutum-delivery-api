import { IsString, MinLength } from "class-validator";

export class ConfirmPhoneVerificationDto {
  @IsString()
  verificationId: string;

  @IsString()
  @MinLength(4)
  code: string;
}
