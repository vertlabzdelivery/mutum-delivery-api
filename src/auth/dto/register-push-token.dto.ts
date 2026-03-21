import { IsOptional, IsString } from "class-validator";

export class RegisterPushTokenDto {
  @IsOptional()
  @IsString()
  expoPushToken?: string;
}
