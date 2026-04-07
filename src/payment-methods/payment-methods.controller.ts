import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { PaymentMethodsService } from './payment-methods.service';
import { UpdateRestaurantPaymentMethodsDto } from './dto/update-restaurant-payment-methods.dto';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Get('active')
  listActive() {
    return this.paymentMethodsService.listActive();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get('me/restaurant')
  getMyRestaurantMethods(@CurrentUser() user: CurrentUserData) {
    return this.paymentMethodsService.getMyRestaurantPaymentMethods(user);
  }

  @Get('restaurant/:restaurantId')
  getRestaurantMethods(@Param('restaurantId', new ParseUUIDPipe()) restaurantId: string) {
    return this.paymentMethodsService.getRestaurantPaymentMethods(restaurantId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch('restaurant/:restaurantId')
  updateRestaurantMethods(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Body() dto: UpdateRestaurantPaymentMethodsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.paymentMethodsService.updateRestaurantPaymentMethods(restaurantId, dto.paymentMethodIds || [], user);
  }
}
