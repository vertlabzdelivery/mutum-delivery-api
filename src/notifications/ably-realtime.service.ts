import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';

@Injectable()
export class AblyRealtimeService {
  private readonly logger = new Logger(AblyRealtimeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private get apiKey() {
    return this.configService.get<string>('ABLY_API_KEY')?.trim() || '';
  }

  private get channelPrefix() {
    return this.configService.get<string>('ABLY_CHANNEL_PREFIX')?.trim() || 'restaurants';
  }

  private get restBaseUrl() {
    return 'https://main.realtime.ably.net';
  }

  /** TTL do token Ably em segundos. Padrão: 23 horas (< 24h máximo do Ably). */
  private get tokenTtlSeconds() {
    const parsed = Number(this.configService.get('ABLY_TOKEN_TTL_SECONDS'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 23 * 60 * 60;
  }

  isEnabled() {
    return Boolean(this.apiKey);
  }

  private parseApiKey() {
    const apiKey = this.apiKey;
    if (!apiKey || !apiKey.includes(':')) {
      throw new ServiceUnavailableException(
        'Ably não configurado. Defina ABLY_API_KEY nas variáveis de ambiente do Vercel.',
      );
    }

    const [keyName, keySecret] = apiKey.split(':');
    if (!keyName || !keySecret) {
      throw new ServiceUnavailableException('ABLY_API_KEY inválida.');
    }

    return { keyName, keySecret };
  }

  getRestaurantOrdersChannelName(restaurantId: string) {
    return `${this.channelPrefix}:${restaurantId}:orders`;
  }

  getPublicCouponsChannelName() {
    return `${this.channelPrefix}:public:coupons`;
  }

  async publishNewOrder(restaurantId: string, payload: Record<string, unknown>) {
    if (!this.isEnabled() || !restaurantId) return;
    await this.publishToChannel(restaurantId, 'new-order', payload);
  }

  async publishOrderStatusChanged(
    restaurantId: string,
    payload: { orderId: string; previousStatus: string; newStatus: string; note?: string | null },
  ) {
    if (!this.isEnabled() || !restaurantId) return;
    await this.publishToChannel(restaurantId, 'order-status-changed', payload);
  }

  async publishPromotionalCouponCreated(payload: Record<string, unknown>) {
    if (!this.isEnabled()) return;
    await this.publishToAbsoluteChannel(this.getPublicCouponsChannelName(), 'coupon-created', payload);
  }

  private async publishToChannel(
    restaurantId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ) {
    return this.publishToAbsoluteChannel(this.getRestaurantOrdersChannelName(restaurantId), eventName, {
      ...payload,
      restaurantId,
    });
  }

  private async publishToAbsoluteChannel(
    channelName: string,
    eventName: string,
    payload: Record<string, unknown>,
  ) {
    try {
      const response = await fetch(
        `${this.restBaseUrl}/channels/${encodeURIComponent(channelName)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(this.apiKey).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: eventName,
            data: {
              ...payload,
              sentAt: new Date().toISOString(),
            },
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ably REST ${response.status}: ${text}`);
      }
    } catch (error) {
      this.logger.warn(
        `Falha ao publicar evento Ably '${eventName}' no canal ${channelName}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  async createCustomerCouponsToken(currentUser: CurrentUserData) {
    const { keyName, keySecret } = this.parseApiKey();

    const now = Math.floor(Date.now() / 1000);
    const ttl = this.tokenTtlSeconds;
    const expiresAt = now + ttl;

    const capability = JSON.stringify({
      [this.getPublicCouponsChannelName()]: ['subscribe'],
    });

    const token = await this.jwtService.signAsync(
      {
        iat: now,
        exp: expiresAt,
        'x-ably-capability': capability,
        'x-ably-clientId': `customer:${currentUser.userId}`,
      },
      {
        algorithm: 'HS256',
        secret: keySecret,
        header: { alg: 'HS256', kid: keyName, typ: 'JWT' },
      },
    );

    return {
      token,
      ttlSeconds: ttl,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      channel: this.getPublicCouponsChannelName(),
    };
  }

  async createRestaurantPanelToken(
    restaurantId: string,
    currentUser: CurrentUserData,
  ) {
    if (!restaurantId) {
      throw new NotFoundException('Restaurante não informado.');
    }

    // Verificamos a configuração do Ably antes de bater no banco
    // para dar um erro claro de 503 (não 401) quando não configurado
    const { keyName, keySecret } = this.parseApiKey();

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado.');
    }

    const canAccess =
      currentUser.role === Role.ADMIN || restaurant.ownerId === currentUser.userId;
    if (!canAccess) {
      throw new ForbiddenException(
        'Você não pode acessar o canal em tempo real deste restaurante.',
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = this.tokenTtlSeconds;
    const expiresAt = now + ttl;

    const capability = JSON.stringify({
      [this.getRestaurantOrdersChannelName(restaurantId)]: ['subscribe'],
    });

    const token = await this.jwtService.signAsync(
      {
        iat: now,
        exp: expiresAt,
        'x-ably-capability': capability,
        'x-ably-clientId': `restaurant-panel:${currentUser.userId}`,
      },
      {
        algorithm: 'HS256',
        secret: keySecret,
        header: { alg: 'HS256', kid: keyName, typ: 'JWT' },
      },
    );

    return {
      token,
      ttlSeconds: ttl,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      channel: this.getRestaurantOrdersChannelName(restaurantId),
    };
  }
}
