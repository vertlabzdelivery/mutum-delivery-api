import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponsService } from './coupons.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  validate(@CurrentUser() user: CurrentUserData, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validateCouponPreview(user.userId, dto);
  }
}
