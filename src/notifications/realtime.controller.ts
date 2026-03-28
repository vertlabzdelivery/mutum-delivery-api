import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { AblyRealtimeService } from './ably-realtime.service';

@Controller('realtime/ably')
export class RealtimeController {
  constructor(private readonly ablyRealtimeService: AblyRealtimeService) {}

  @UseGuards(JwtAuthGuard)
  @Get('token')
  token(
    @Query('restaurantId') restaurantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ablyRealtimeService.createRestaurantPanelToken(restaurantId, user);
  }
}
