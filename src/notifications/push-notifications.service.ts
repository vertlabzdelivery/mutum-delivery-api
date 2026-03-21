import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  constructor(private readonly configService: ConfigService) {}

  isEnabled() {
    return this.configService.get<string>('EXPO_PUSH_ENABLED', 'true') !== 'false';
  }

  async sendToExpoPushToken(token: string, payload: { title: string; body: string; data?: Record<string, unknown> }) {
    if (!this.isEnabled() || !token) return { ok: false, skipped: true };
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      this.logger.warn(`Token Expo inválido ignorado: ${token.slice(0, 24)}...`);
      return { ok: false, skipped: true };
    }
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ to: token, sound: 'default', title: payload.title, body: payload.body, data: payload.data ?? {} }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        this.logger.warn(`Expo push retornou ${response.status}: ${JSON.stringify(json)}`);
        return { ok: false, status: response.status, payload: json };
      }
      return { ok: true, payload: json };
    } catch (error) {
      this.logger.warn(`Falha ao enviar push: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      return { ok: false, error };
    }
  }
}
