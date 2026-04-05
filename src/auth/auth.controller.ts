import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import type { RequestContextData } from '../common/interfaces/request-context.interface';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { ConfirmPasswordRecoveryDto } from './dto/confirm-password-recovery.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { StartPasswordRecoveryDto } from './dto/start-password-recovery.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register-restaurant')
  registerRestaurant(@Body() dto: RegisterRestaurantDto) {
    return this.authService.registerRestaurant(dto);
  }

  @Post('login')
  login(@Req() req: Request, @Body() dto: LoginDto) {
    return this.authService.login(dto, this.getClientIp(req));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('password-recovery/start')
  startPasswordRecovery(@Req() req: Request, @Body() dto: StartPasswordRecoveryDto) {
    return this.authService.startPasswordRecovery(dto, this.getClientIp(req));
  }

  @Post('password-recovery/confirm')
  confirmPasswordRecovery(@Body() dto: ConfirmPasswordRecoveryDto) {
    return this.authService.confirmPasswordRecovery(dto);
  }

  @Post('password-recovery/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: CurrentUserData) {
    return this.authService.logout(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: CurrentUserData) {
    return this.authService.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('phone-verification/start')
  startPhoneVerification(@Req() req: Request, @CurrentUser() user: CurrentUserData, @Body() dto: StartPhoneVerificationDto) {
    return this.authService.startPhoneVerification(user.userId, dto, this.getClientIp(req));
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

  private getClientIp(req: Request) {
    const request = req as Request & RequestContextData;
    return request.clientIp || req.ip || 'unknown';
  }
}
