import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReplaceOpeningHoursDto } from './dto/replace-opening-hours.dto';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { RestaurantsService } from './restaurants.service';
import { UpsertRestaurantReviewDto } from './dto/upsert-restaurant-review.dto';

@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get('active')
  findActive() {
    return this.restaurantsService.findActive();
  }

  @UseGuards(JwtAuthGuard)
  @Get('available/by-address/:addressId')
  findAvailableByAddress(
    @Param('addressId', new ParseUUIDPipe()) addressId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.findAvailableByAddress(addressId, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/favorites')
  findMyFavorites(@CurrentUser() user: CurrentUserData) {
    return this.restaurantsService.findFavoriteRestaurants(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get('my/owned')
  findOwned(@CurrentUser() user: CurrentUserData) {
    return this.restaurantsService.findOwnedByUser(user.userId);
  }

  @Get()
  findAll() {
    return this.restaurantsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/favorite')
  favorite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.favoriteRestaurant(id, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/favorite')
  unfavorite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.unfavoriteRestaurant(id, user.userId);
  }

  @Get(':id/reviews')
  listReviews(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.restaurantsService.listRestaurantReviews(id, Number(page || 1), Number(limit || 20));
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/reviews/me')
  getMyReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.getMyRestaurantReview(id, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  upsertReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpsertRestaurantReviewDto,
  ) {
    return this.restaurantsService.upsertRestaurantReview(id, user.userId, dto);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.restaurantsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Get(':id/opening-hours')
  findOpeningHours(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.restaurantsService.findOpeningHours(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/opening-hours')
  replaceOpeningHours(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceOpeningHoursDto,
  ) {
    return this.restaurantsService.replaceOpeningHours(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateRestaurantDto) {
    return this.restaurantsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRestaurantStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.restaurantsService.updateStatus(id, dto.isActive, user);
  }
}
