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
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemStatusDto } from './dto/update-menu-item-status.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { UpdateMenuCategoryStatusDto } from './dto/update-menu-category-status.dto';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('restaurant/:restaurantId')
  findByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query('onlyAvailable') onlyAvailable?: string,
  ) {
    let parsedOnlyAvailable: boolean | undefined;

    if (onlyAvailable === 'true') {
      parsedOnlyAvailable = true;
    }

    if (onlyAvailable === 'false') {
      parsedOnlyAvailable = false;
    }

    return this.menuService.findByRestaurant(restaurantId, parsedOnlyAvailable);
  }

  @Get('restaurant/:restaurantId/catalog')
  findCatalogByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query('onlyAvailable') onlyAvailable?: string,
  ) {
    return this.menuService.findCatalogByRestaurant(
      restaurantId,
      onlyAvailable !== 'false',
    );
  }

  @Get('restaurant/:restaurantId/categories')
  findCategoriesByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.menuService.findCategoriesByRestaurant(
      restaurantId,
      activeOnly === 'true',
    );
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.menuService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Post('categories')
  createCategory(
    @Body() dto: CreateMenuCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.createCategory(dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch('categories/:id')
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.updateCategory(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch('categories/:id/status')
  updateCategoryStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuCategoryStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.updateCategoryStatus(id, dto.isActive, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Delete('categories/:id')
  removeCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.removeCategory(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Post()
  create(
    @Body() dto: CreateMenuItemDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.create(dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuItemStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.updateStatus(id, dto.isAvailable, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.menuService.remove(id, user);
  }
}
