import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateNeighborhoodDto } from './dto/create-neighborhood.dto';
import { CreateStateDto } from './dto/create-state.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('states')
  findStates() {
    return this.locationsService.findStates();
  }

  @Get('states/:stateId')
  findStateById(@Param('stateId', new ParseUUIDPipe()) stateId: string) {
    return this.locationsService.findStateById(stateId);
  }

  @Get('states/:stateId/cities')
  findCitiesByState(@Param('stateId', new ParseUUIDPipe()) stateId: string) {
    return this.locationsService.findCitiesByState(stateId);
  }

  @Get('cities/:cityId')
  findCityById(@Param('cityId', new ParseUUIDPipe()) cityId: string) {
    return this.locationsService.findCityById(cityId);
  }

  @Get('cities/:cityId/neighborhoods')
  findNeighborhoodsByCity(
    @Param('cityId', new ParseUUIDPipe()) cityId: string,
  ) {
    return this.locationsService.findNeighborhoodsByCity(cityId);
  }

  @Get('neighborhoods/:id')
  findNeighborhoodById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.locationsService.findNeighborhoodById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('states')
  createState(@Body() dto: CreateStateDto) {
    return this.locationsService.createState(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('cities')
  createCity(@Body() dto: CreateCityDto) {
    return this.locationsService.createCity(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('neighborhoods')
  createNeighborhood(@Body() dto: CreateNeighborhoodDto) {
    return this.locationsService.createNeighborhood(dto);
  }
}