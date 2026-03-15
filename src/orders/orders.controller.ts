import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  findMyOrders(@CurrentUser() user: CurrentUserData) {
    return this.ordersService.findMyOrders(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get('restaurant/:restaurantId')
  findRestaurantOrders(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.findRestaurantOrders(restaurantId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user);
  }
}