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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateDefaultAddressDto } from './dto/update-default-address.dto';

@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(
    @Body() dto: CreateAddressDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.addressesService.create(dto, user);
  }

  @Get('my')
  findMyAddresses(@CurrentUser() user: CurrentUserData) {
    return this.addressesService.findMyAddresses(user);
  }

  @Get('my/default')
  findMyDefaultAddress(@CurrentUser() user: CurrentUserData) {
    return this.addressesService.findMyDefaultAddress(user);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.addressesService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.addressesService.update(id, dto, user);
  }

  @Patch(':id/default')
  updateDefault(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDefaultAddressDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.addressesService.updateDefault(id, dto.isDefault, user);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.addressesService.remove(id, user);
  }
}