import { IsIn, IsOptional, IsString } from "class-validator";

export class StartPhoneVerificationDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsIn(["SMS", "WHATSAPP"])
  channel?: "SMS" | "WHATSAPP";
}
