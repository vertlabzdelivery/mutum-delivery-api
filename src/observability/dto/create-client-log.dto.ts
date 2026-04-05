import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClientLogDto {
  @IsString()
  @MaxLength(120)
  event!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  stack?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
