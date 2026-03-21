import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MinLength(6)
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
