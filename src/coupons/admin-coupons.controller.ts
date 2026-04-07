import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CouponsService } from './coupons.service';
import { CreatePromotionalCouponDto } from './dto/create-promotional-coupon.dto';
import { ListPromotionalCouponsDto } from './dto/list-promotional-coupons.dto';
import { UpdatePromotionalCouponDto } from './dto/update-promotional-coupon.dto';

@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreatePromotionalCouponDto) {
    return this.couponsService.createPromotionalCoupon(user.userId, dto);
  }

  @Get()
  list(@Query() query: ListPromotionalCouponsDto) {
    return this.couponsService.listPromotionalCoupons(query);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.couponsService.getPromotionalCouponById(id);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdatePromotionalCouponDto) {
    return this.couponsService.updatePromotionalCoupon(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.couponsService.deactivatePromotionalCoupon(id);
  }

  @Get(':id/usages')
  usages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.couponsService.listPromotionalCouponUsages(id, Number(page || 1), Number(limit || 50));
  }
}
