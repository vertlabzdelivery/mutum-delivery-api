import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EphemeralStoreService } from './ephemeral-store.service';

@Injectable()
export class AuthProtectionService {
  constructor(private readonly store: EphemeralStoreService) {}

  async assertLoginRateLimit(clientIp: string, email: string) {
    await this.consumeLimit(`auth:login:ip:${clientIp}`, this.getNumber('AUTH_LOGIN_RATE_LIMIT_PER_IP', 20), this.getNumber('AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS', 900), 'Muitas tentativas de login a partir deste IP.');
    await this.consumeLimit(`auth:login:email:${email}`, this.getNumber('AUTH_LOGIN_RATE_LIMIT_PER_EMAIL', 10), this.getNumber('AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS', 900), 'Muitas tentativas de login para esta conta.');
  }

  async assertLoginAllowed(clientIp: string, email: string) {
    const key = this.getLoginBlockKey(clientIp, email);
    const blocked = await this.store.get<{ reason: string; blockedAt: string }>(key);
    if (!blocked) return;
    throw new HttpException('Conta temporariamente bloqueada por muitas tentativas erradas. Aguarde e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
  }

  async registerFailedLogin(clientIp: string, email: string) {
    const threshold = this.getNumber('AUTH_LOGIN_FAILURE_BLOCK_THRESHOLD', 5);
    const blockSeconds = this.getNumber('AUTH_LOGIN_BLOCK_SECONDS', 900);
    const failureWindowSeconds = this.getNumber('AUTH_LOGIN_FAILURE_WINDOW_SECONDS', blockSeconds);
    const failureKey = this.getLoginFailureKey(clientIp, email);
    const totalFailures = await this.store.increment(failureKey, failureWindowSeconds);

    if (totalFailures >= threshold) {
      await this.store.set(this.getLoginBlockKey(clientIp, email), { reason: 'too_many_invalid_credentials', blockedAt: new Date().toISOString(), blockId: randomUUID() }, blockSeconds);
      throw new HttpException('Conta temporariamente bloqueada por muitas tentativas erradas. Aguarde e tente novamente.', HttpStatus.TOO_MANY_REQUESTS);
    }

    throw new UnauthorizedException('Credenciais inválidas');
  }

  async clearLoginFailures(clientIp: string, email: string) {
    await Promise.all([
      this.store.delete(this.getLoginFailureKey(clientIp, email)),
      this.store.delete(this.getLoginBlockKey(clientIp, email)),
    ]);
  }

  async assertSmsRateLimit(clientIp: string, target: string) {
    await this.consumeLimit(`auth:sms:ip:${clientIp}`, this.getNumber('AUTH_SMS_RATE_LIMIT_PER_IP', 8), this.getNumber('AUTH_SMS_RATE_LIMIT_WINDOW_SECONDS', 900), 'Muitas solicitações de SMS a partir deste IP.');
    await this.consumeLimit(`auth:sms:target:${target}`, this.getNumber('AUTH_SMS_RATE_LIMIT_PER_TARGET', 3), this.getNumber('AUTH_SMS_RATE_LIMIT_WINDOW_SECONDS', 900), 'Muitas solicitações de SMS para este destino.');
  }

  async assertPasswordRecoveryRateLimit(clientIp: string, phone: string) {
    await this.consumeLimit(`auth:password-recovery:ip:${clientIp}`, this.getNumber('AUTH_PASSWORD_RECOVERY_RATE_LIMIT_PER_IP', 6), this.getNumber('AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS', 1800), 'Muitas tentativas de recuperação de senha a partir deste IP.');
    await this.consumeLimit(`auth:password-recovery:phone:${phone}`, this.getNumber('AUTH_PASSWORD_RECOVERY_RATE_LIMIT_PER_PHONE', 3), this.getNumber('AUTH_PASSWORD_RECOVERY_RATE_LIMIT_WINDOW_SECONDS', 1800), 'Muitas tentativas de recuperação de senha para este telefone.');
  }

  getVerificationBlockSeconds() {
    return this.getNumber('AUTH_VERIFICATION_BLOCK_SECONDS', 900);
  }

  private async consumeLimit(key: string, limit: number, windowSeconds: number, message: string) {
    if (limit <= 0) return;
    const next = await this.store.increment(key, windowSeconds);
    if (next > limit) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private getLoginFailureKey(clientIp: string, email: string) {
    return `auth:login:fail:${email}:${clientIp}`;
  }

  private getLoginBlockKey(clientIp: string, email: string) {
    return `auth:login:block:${email}:${clientIp}`;
  }

  private getNumber(name: string, fallback: number) {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
