import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

type PushResult = {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  payload?: unknown;
  error?: unknown;
};

type ExpoPushTicket = {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  constructor(private readonly configService: ConfigService) {}

  isEnabled() {
    return this.configService.get<string>('EXPO_PUSH_ENABLED', 'true') !== 'false';
  }

  async sendToExpoPushToken(token: string, payload: PushPayload): Promise<PushResult> {
    const normalizedToken = String(token || '').trim();

    if (!this.isEnabled() || !normalizedToken) {
      return { ok: false, skipped: true };
    }

    if (
      !normalizedToken.startsWith('ExponentPushToken[') &&
      !normalizedToken.startsWith('ExpoPushToken[')
    ) {
      this.logger.warn(
        `Token Expo inválido ignorado: ${normalizedToken.slice(0, 24)}...`,
      );
      return { ok: false, skipped: true };
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          to: normalizedToken,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data ?? {},
          channelId: payload.channelId || 'default',
          priority: payload.priority || 'high',
        }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        this.logger.warn(
          `Expo push retornou ${response.status}: ${JSON.stringify(json)}`,
        );
        return { ok: false, status: response.status, payload: json };
      }

      const tickets = this.extractTickets(json);
      const ticketError = tickets.find((ticket) => ticket?.status === 'error');

      if (ticketError) {
        this.logger.warn(
          `Expo push ticket com erro: ${JSON.stringify({
            message: ticketError.message || null,
            details: ticketError.details || null,
            tokenPrefix: `${normalizedToken.slice(0, 18)}...`,
          })}`,
        );
        return { ok: false, status: response.status, payload: json };
      }

      return { ok: true, status: response.status, payload: json };
    } catch (error) {
      this.logger.warn(
        `Falha ao enviar push: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
      );
      return { ok: false, error };
    }
  }

  private extractTickets(payload: unknown): ExpoPushTicket[] {
    if (!payload || typeof payload !== 'object') return [];

    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data.filter(
        (ticket): ticket is ExpoPushTicket => Boolean(ticket) && typeof ticket === 'object',
      );
    }

    if (data && typeof data === 'object') {
      return [data as ExpoPushTicket];
    }

    return [];
  }
}
