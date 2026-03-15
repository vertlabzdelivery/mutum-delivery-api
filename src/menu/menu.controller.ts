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
import { RolesGuard } from '../common/guards/roles.guard';
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
  create(@Body() dto: CreateMenuItemDto) {
    return this.menuService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMenuItemStatusDto,
  ) {
    return this.menuService.updateStatus(id, dto.isAvailable);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RESTAURANT)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.menuService.remove(id);
  }
}