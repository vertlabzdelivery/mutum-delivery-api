import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { BillingService } from './billing.service';
import { BillingReportQueryDto } from './dto/billing-report-query.dto';
import { SaveBillingCycleDto } from './dto/save-billing-cycle.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RESTAURANT)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('report')
  getReport(
    @CurrentUser() user: CurrentUserData,
    @Query() query: BillingReportQueryDto,
  ) {
    return this.billingService.getReport(user, query);
  }

  @Get('cycles')
  listCycles(
    @CurrentUser() user: CurrentUserData,
    @Query('restaurantId') restaurantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billingService.listCycles(user, restaurantId, Number(page || 1), Number(limit || 30));
  }

  @Post('cycles/save')
  saveCycle(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SaveBillingCycleDto,
  ) {
    return this.billingService.saveCycle(user, dto);
  }
}
