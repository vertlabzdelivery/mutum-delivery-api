import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { AblyRealtimeService } from './ably-realtime.service';

@Controller('realtime/ably')
export class RealtimeController {
  constructor(private readonly ablyRealtimeService: AblyRealtimeService) {}

  @UseGuards(JwtAuthGuard)
  @Get('customer-token')
  customerToken(@CurrentUser() user: CurrentUserData) {
    return this.ablyRealtimeService.createCustomerCouponsToken(user);
  }

  /**
   * Gera um token JWT Ably para o painel do restaurante.
   *
   * O token retornado tem TTL longo (padrão 23h) — o frontend NÃO deve
   * fazer polling desta rota. O token deve ser armazenado e reutilizado
   * até próximo do `expiresAt`, momento em que uma nova chamada é feita.
   *
   * Fluxo correto no cliente:
   *   1. Chama esta rota na inicialização do painel
   *   2. Usa `expiresAt` para agendar o próximo refresh (ex: 30 min antes)
   *   3. Não chama esta rota em intervalos fixos (polling)
   */
  @UseGuards(JwtAuthGuard)
  @Get('token')
  token(
    @Query('restaurantId') restaurantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ablyRealtimeService.createRestaurantPanelToken(restaurantId, user);
  }
}
