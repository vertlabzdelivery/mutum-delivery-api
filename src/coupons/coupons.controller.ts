import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { ListPromotionalCouponsDto } from './dto/list-promotional-coupons.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CouponsService } from './coupons.service';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('public')
  listPublic(@Query() query: ListPromotionalCouponsDto) {
    return this.couponsService.listPublicPromotionalCoupons(query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  validate(@CurrentUser() user: CurrentUserData, @Body() dto: ValidateCouponDto) {
    return this.couponsService.validateCouponPreview(user.userId, dto);
  }
}
