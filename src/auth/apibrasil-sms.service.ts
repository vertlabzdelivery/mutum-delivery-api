import { Injectable, Logger } from '@nestjs/common';
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

  async startVerification(phone: string, preferredChannel?: string, purpose: 'PHONE_VERIFICATION' | 'PASSWORD_RESET' = 'PHONE_VERIFICATION') {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) throw new Error('Telefone inválido para verificação.');

    const channel = String(preferredChannel || this.configService.get('VERIFICATION_DEFAULT_CHANNEL', 'SMS')).toUpperCase();
    if (channel === 'WHATSAPP') {
      this.logger.warn('WhatsApp ainda não configurado na integração SMS. Seguindo com SMS.');
    }
    return this.startSmsVerification(normalizedPhone, purpose);
  }

  private async startSmsVerification(normalizedPhone: string, purpose: 'PHONE_VERIFICATION' | 'PASSWORD_RESET') {
    const bearer = String(this.configService.get('APIBRASIL_BEARER_TOKEN') || '').trim();
    if (!bearer) {
      throw new Error('APIBRASIL_BEARER_TOKEN não configurado.');
    }

    const code = this.generateCode();
    const brand = this.configService.get<string>('APP_BRAND_NAME', 'UaiPede');
    const smsType = String(this.configService.get('APIBRASIL_SMS_TYPE', 'sms-otp') || 'sms-otp').trim() || 'sms-otp';
    const smsOperator = String(this.configService.get('APIBRASIL_SMS_OPERATOR', 'claro') || 'claro').trim() || 'claro';
    const message = purpose === 'PASSWORD_RESET'
      ? `${brand}: código para redefinir sua senha ${code}. Use este código para continuar a recuperação de acesso. Não compartilhe este código com ninguém.`
      : `${brand}: código de verificação ${code}. Use este código para confirmar seu telefone e concluir sua solicitação. Não compartilhe este código com ninguém.`;

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

    const json = await response.json().catch(() => null) as any;
    if (!response.ok) {
      throw new Error(json?.message || json?.error || 'Não foi possível enviar o código por SMS.');
    }

    return {
      channel: 'SMS' as const,
      provider: 'INTERNAL' as const,
      providerKey: json?.id || json?.requestId || json?.data?.id || null,
      localCodeHash: this.hashCode(code),
      normalizedPhone,
      message: purpose === 'PASSWORD_RESET'
        ? 'Enviamos um código por SMS para continuar a recuperação da sua senha.'
        : 'Enviamos um código por SMS de alta prioridade para confirmar seu telefone.',
    };
  }
}
