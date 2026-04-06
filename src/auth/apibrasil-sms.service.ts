import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class ApiBrasilSmsService {
  private readonly logger = new Logger(ApiBrasilSmsService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(this.configService.get('APIBRASIL_BEARER_TOKEN'));
  }

  normalizePhone(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  hashCode(code: string) {
    return this.hashValue(code);
  }

  hashValue(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  generateSecureToken(size = 32) {
    return crypto.randomBytes(size).toString('hex');
  }

  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async startVerification(
    phone: string,
    preferredChannel?: string,
    purpose: 'PHONE_VERIFICATION' | 'PASSWORD_RESET' = 'PHONE_VERIFICATION',
  ) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Telefone invÃ¡lido para verificaÃ§Ã£o.');

    const channel = String(preferredChannel || this.configService.get('VERIFICATION_DEFAULT_CHANNEL', 'SMS')).toUpperCase();
    if (channel === 'WHATSAPP') {
      this.logger.warn('WhatsApp ainda nÃ£o configurado na integraÃ§Ã£o SMS. Seguindo com SMS.');
    }
    return this.startSmsVerification(normalizedPhone, purpose);
  }

  private async startSmsVerification(normalizedPhone: string, purpose: 'PHONE_VERIFICATION' | 'PASSWORD_RESET') {
    const bearer = String(this.configService.get('APIBRASIL_BEARER_TOKEN') || '').trim();
    if (!bearer) {
      throw new Error('APIBRASIL_BEARER_TOKEN nÃ£o configurado.');
    }

    const code = this.generateCode();
    const brand = this.configService.get<string>('APP_BRAND_NAME', 'UaiPede');
    const smsType = String(this.configService.get('APIBRASIL_SMS_TYPE', 'sms-otp') || 'sms-otp').trim() || 'sms-otp';
    const smsOperator = String(this.configService.get('APIBRASIL_SMS_OPERATOR', 'claro') || 'claro').trim() || 'claro';
    const message = purpose === 'PASSWORD_RESET'
      ? `${brand}: cÃ³digo para redefinir sua senha ${code}. Use este cÃ³digo para continuar a recuperaÃ§Ã£o de acesso. NÃ£o compartilhe este cÃ³digo com ninguÃ©m.`
      : `${brand}: cÃ³digo de verificaÃ§Ã£o ${code}. Use este cÃ³digo para confirmar seu telefone e concluir sua solicitaÃ§Ã£o. NÃ£o compartilhe este cÃ³digo com ninguÃ©m.`;

    const payload = {
      tipo: smsType,
      number: normalizedPhone,
      message,
      operator: smsOperator,
      user_reply: true,
    };

    this.logger.log(`Enviando SMS de alta prioridade (${smsType}) para ${normalizedPhone}.`);

    const response = await fetch('https://gateway.apibrasil.io/api/v2/sms/send/credits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text().catch(() => '');
    const json = this.parseJson(rawBody);

    if (!response.ok) {
      this.logger.error(`Falha ao enviar SMS pela APIBrasil. status=${response.status} body=${this.stringifyForLog(json ?? rawBody)}`);
      throw new BadGatewayException(this.extractProviderError(json, rawBody) || 'NÃ£o foi possÃ­vel enviar o cÃ³digo por SMS.');
    }

    if (json && this.isExplicitProviderFailure(json)) {
      this.logger.error(`APIBrasil respondeu sucesso HTTP, mas sinalizou erro de negÃ³cio. body=${this.stringifyForLog(json)}`);
      throw new BadGatewayException(this.extractProviderError(json, rawBody) || 'A API de SMS recusou a solicitaÃ§Ã£o.');
    }

    if (!this.looksLikeSuccessfulResponse(json, rawBody)) {
      this.logger.warn(`Resposta 2xx da APIBrasil em formato inesperado. status=${response.status} body=${this.stringifyForLog(json ?? rawBody)}`);
    }

    return {
      channel: 'SMS' as const,
      provider: 'INTERNAL' as const,
      providerKey: this.extractProviderKey(json),
      localCodeHash: this.hashCode(code),
      normalizedPhone,
      message: purpose === 'PASSWORD_RESET'
        ? 'Enviamos um cÃ³digo por SMS para continuar a recuperaÃ§Ã£o da sua senha.'
        : 'Enviamos um cÃ³digo por SMS de alta prioridade para confirmar seu telefone.',
    };
  }

  private parseJson(rawBody: string) {
    if (!rawBody) return null;

    try {
      return JSON.parse(rawBody) as Record<string, any>;
    } catch {
      return null;
    }
  }

  private isExplicitProviderFailure(json: Record<string, any>) {
    if (json.error === true || json.success === false) return true;

    const status = String(json.status || json.response?.status || '').toLowerCase();
    return ['error', 'failed', 'fail', 'invalid'].includes(status);
  }

  private looksLikeSuccessfulResponse(json: Record<string, any> | null, rawBody: string) {
    if (!json) {
      return Boolean(rawBody.trim());
    }

    if (json.error === false || json.success === true) return true;
    if (this.extractProviderKey(json)) return true;

    const message = String(json.message || json.response?.message || '').toLowerCase();
    return message.includes('sucesso') || message.includes('processada');
  }

  private extractProviderKey(json: Record<string, any> | null) {
    if (!json) return null;

    return json.id
      || json.requestId
      || json.data?.id
      || json.response?.id
      || json.response?.requestId
      || json.response?.message_id
      || json.response?.sms_id
      || null;
  }

  private extractProviderError(json: Record<string, any> | null, rawBody: string) {
    if (!json) {
      return rawBody.trim() || null;
    }

    return json.message
      || json.error
      || json.response?.message
      || json.response?.error
      || rawBody.trim()
      || null;
  }

  private stringifyForLog(value: unknown) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 600 ? `${serialized.slice(0, 600)}...` : serialized;
  }
}
