import {
  Body,
  Controller,
  Delete,
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
import { CreateRestaurantDeliveryZoneDto } from './dto/create-restaurant-delivery-zone.dto';
import { UpdateRestaurantDeliveryZoneDto } from './dto/update-restaurant-delivery-zone.dto';
import { UpdateRestaurantDeliveryZoneStatusDto } from './dto/update-restaurant-delivery-zone-status.dto';
import { RestaurantDeliveryZonesService } from './restaurant-delivery-zones.service';

@Controller('restaurant-delivery-zones')
export class RestaurantDeliveryZonesController {
  constructor(
    private readonly restaurantDeliveryZonesService: RestaurantDeliveryZonesService,
  ) {}

  @Get('public/restaurant/:restaurantId')
  findPublicByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
  ) {
    return this.restaurantDeliveryZonesService.findPublicByRestaurant(
      restaurantId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get('restaurant/:restaurantId')
  findByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.findByRestaurant(
      restaurantId,
      user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Post()
  create(
    @Body() dto: CreateRestaurantDeliveryZoneDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantDeliveryZoneDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantDeliveryZoneStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.updateStatus(
      id,
      dto.isActive,
      user,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantDeliveryZonesService.remove(id, user);
  }
}