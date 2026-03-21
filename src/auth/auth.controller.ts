import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto) { return this.authService.register(dto); }
  @Post('register-restaurant') registerRestaurant(@Body() dto: RegisterRestaurantDto) { return this.authService.registerRestaurant(dto); }
  @Post('login') login(@Body() dto: LoginDto) { return this.authService.login(dto); }
  @Post('refresh') refresh(@Body() dto: RefreshTokenDto) { return this.authService.refreshToken(dto.refreshToken); }

  @UseGuards(JwtAuthGuard)
  @Get('me') me(@CurrentUser() user: CurrentUserData) { return this.authService.me(user.userId); }

  @UseGuards(JwtAuthGuard)
  @Post('phone-verification/start')
  startPhoneVerification(@CurrentUser() user: CurrentUserData, @Body() dto: StartPhoneVerificationDto) {
    return this.authService.startPhoneVerification(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('phone-verification/confirm')
  confirmPhoneVerification(@CurrentUser() user: CurrentUserData, @Body() dto: ConfirmPhoneVerificationDto) {
    return this.authService.confirmPhoneVerification(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('phone-verification/status')
  phoneVerificationStatus(@CurrentUser() user: CurrentUserData) {
    return this.authService.getPhoneVerificationStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('push-token')
  registerPushToken(@CurrentUser() user: CurrentUserData, @Body() dto: RegisterPushTokenDto) {
    return this.authService.registerPushToken(user.userId, dto);
  }
}
