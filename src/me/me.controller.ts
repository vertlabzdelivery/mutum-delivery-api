import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CouponsService } from '../coupons/coupons.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('referral-code')
  referralCode(@CurrentUser() user: CurrentUserData) {
    return this.couponsService.getMyReferralCode(user.userId);
  }

  @Get('referral-rewards')
  referralRewards(@CurrentUser() user: CurrentUserData) {
    return this.couponsService.getMyReferralRewards(user.userId);
  }

  @Get('referral-history')
  referralHistory(@CurrentUser() user: CurrentUserData) {
    return this.couponsService.getMyReferralHistory(user.userId);
  }
}
