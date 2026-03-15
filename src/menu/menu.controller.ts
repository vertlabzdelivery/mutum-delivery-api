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
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('restaurant/:restaurantId')
  findByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query('onlyAvailable') onlyAvailable?: string,
  ) {
    let parsedOnlyAvailable: boolean | undefined = undefined;

    if (onlyAvailable === 'true') {
      parsedOnlyAvailable = true;
    }

    if (onlyAvailable === 'false') {
      parsedOnlyAvailable = false;
    }

    return this.menuService.findByRestaurant(
      restaurantId,
      parsedOnlyAvailable,
    );
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.menuService.findOne(id);
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