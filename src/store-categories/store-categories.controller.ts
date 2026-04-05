import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { StoreCategoriesService } from './store-categories.service';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { SetRestaurantStoreCategoriesDto } from './dto/set-restaurant-store-categories.dto';

@Controller('store-categories')
export class StoreCategoriesController {
  constructor(private readonly service: StoreCategoriesService) {}

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateStoreCategoryDto) {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStoreCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }

  @Get('restaurant/:restaurantId')
  findRestaurantCategories(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
  ) {
    return this.service.findRestaurantCategories(restaurantId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Put('restaurant/:restaurantId')
  setRestaurantCategories(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Body() dto: SetRestaurantStoreCategoriesDto,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return this.service.setRestaurantCategories(restaurantId, dto, currentUser);
  }
}
