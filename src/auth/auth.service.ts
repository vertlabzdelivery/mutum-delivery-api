import {
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { generateReferralCode } from '../coupons/coupon-code.util';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProtectionService } from '../security/auth-protection.service';
import { EphemeralStoreService } from '../security/ephemeral-store.service';
import { UsersService } from '../users/users.service';
import { ApiBrasilSmsService } from './apibrasil-sms.service';
import { ConfirmPasswordRecoveryDto } from './dto/confirm-password-recovery.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { StartPasswordRecoveryDto } from './dto/start-password-recovery.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';

const RESEND_LOCKS_IN_SECONDS = [60, 300, 600, 900, 1800, 3600];
const MAX_VERIFICATION_ATTEMPTS = 5;

type AuthJwtPayload = {
  sub: string;
  email: string;
  role: Role;
  sessionId: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: ApiBrasilSmsService,
    private readonly authProtection: AuthProtectionService,
    private readonly ephemeralStore: EphemeralStoreService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = this.normalizePhoneOrNull(dto.phone);

    await this.ensureEmailAvailable(email);
    await this.ensurePhoneAvailable(phone);

    const passwordHash = await bcrypt.hash(dto.password, this.getBcryptRounds());

    try {
      const user = await this.usersService.create({
        name: dto.name.trim(),
        email,
        passwordHash,
        phone: phone ?? undefined,
        role: Role.USER,
      });

      return this.generateTokens(user as User & Record<string, any>);
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  async registerRestaurant(dto: RegisterRestaurantDto) {
    const email = dto.email.trim().toLowerCase();
    const ownerPhone = this.normalizePhoneOrNull(dto.ownerPhone);

    await this.ensureEmailAvailable(email);
    await this.ensurePhoneAvailable(ownerPhone);

    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
      if (!city) throw new NotFoundException('Cidade não encontrada');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.getBcryptRounds());

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: await this.buildUserCreateDataWithReferralCode({
            name: dto.ownerName.trim(),
            email,
            passwordHash,
            phone: ownerPhone,
            role: Role.RESTAURANT,
          }),
        });

        const restaurant = await tx.restaurant.create({
          data: {
            name: dto.restaurantName.trim(),
            description: dto.restaurantDescription?.trim(),
            logoUrl: dto.restaurantLogoUrl?.trim(),
            phone: this.normalizePhoneOrNull(dto.restaurantPhone),
            address: dto.address.trim(),
            cityId: dto.cityId,
            ownerId: user.id,
          },
        });

        return { user, restaurant };
      });

      const tokens = await this.generateTokens(result.user as User & Record<string, any>);
      return { ...tokens, restaurant: result.restaurant };
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  private async buildUserCreateDataWithReferralCode(
    baseData: Omit<Prisma.UserCreateInput, 'referralCode'>,
  ): Promise<Prisma.UserCreateInput> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const referralCode = generateReferralCode();
      const existing = await this.prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      });

      if (!existing) {
        return { ...baseData, referralCode };
      }
    }

    throw new BadRequestException('Falha ao gerar código de indicação para o usuário.');
  }

  async login(dto: LoginDto, clientIp: string) {
    const email = dto.email.trim().toLowerCase();

    await this.authProtection.assertLoginAllowed(clientIp, email);
    await this.authProtection.assertLoginRateLimit(clientIp, email);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn('auth.login.failed', { email, clientIp, reason: 'user_not_found' });
      // BUG CORRIGIDO: registerFailedLogin sempre lança exceção internamente.
      // Chamamos await e deixamos a exceção propagar — a linha abaixo era código morto.
      await this.authProtection.registerFailedLogin(clientIp, email);
      return; // nunca alcançado; satisfaz o TypeScript sem dead-throw
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      this.logger.warn('auth.login.failed', { email, clientIp, userId: user.id, reason: 'invalid_password' });
      await this.authProtection.registerFailedLogin(clientIp, email);
      return; // nunca alcançado
    }

    await this.authProtection.clearLoginFailures(clientIp, email);
    this.logger.log('auth.login.succeeded', { email, clientIp, userId: user.id });
    return this.generateTokens(user as User & Record<string, any>);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<AuthJwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const storedSession = await this.readRefreshSession(payload.sessionId);
      if (!storedSession || storedSession.refreshTokenHash !== this.hashRefreshToken(refreshToken)) {
        throw new UnauthorizedException('Sessão expirada ou revogada. Faça login novamente.');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        await this.deleteRefreshSession(payload.sessionId);
        throw new UnauthorizedException('Usuário não encontrado');
      }

      return this.generateTokens(user as User & Record<string, any>, payload.sessionId);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logout(user: CurrentUserData) {
    await this.deleteRefreshSession(user.sessionId);
    return { success: true, loggedOutAt: new Date().toISOString() };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const { passwordHash, ...rest } = user as any;
    return { ...rest, isPhoneVerified: Boolean((user as any).phoneVerifiedAt) };
  }

  async startPasswordRecovery(dto: StartPasswordRecoveryDto, clientIp: string) {
    const phone = this.normalizePhoneOrNull(dto.phone);
    if (!phone) {
      throw new BadRequestException('Informe um telefone válido para recuperar a senha.');
    }

    await this.authProtection.assertPasswordRecoveryRateLimit(clientIp, phone);

    const user = await this.findUserByVerifiedPhone(phone);
    if (!user) {
      throw new NotFoundException('Nenhuma conta com telefone verificado foi encontrada para esse número.');
    }

    const latestSession = await this.prisma.passwordResetSession.findFirst({
      where: {
        userId: user.id,
        status: { in: ['PENDING', 'FAILED', 'EXPIRED'] },
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestSession?.nextAllowedAt && latestSession.nextAllowedAt.getTime() > Date.now()) {
      const remainingMs = latestSession.nextAllowedAt.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      throw new HttpException(
        `Aguarde ${remainingMinutes} min para solicitar outro código.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const recentCount = await this.prisma.passwordResetSession.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
    });
    const resendCount = Math.max(1, recentCount + 1);
    const lockSeconds = RESEND_LOCKS_IN_SECONDS[Math.min(resendCount - 1, RESEND_LOCKS_IN_SECONDS.length - 1)];
    const nextAllowedAt = new Date(Date.now() + lockSeconds * 1000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const started = await this.smsService.startVerification(phone, 'SMS', 'PASSWORD_RESET');

    const session = await this.prisma.passwordResetSession.create({
      data: {
        userId: user.id,
        phone: started.normalizedPhone,
        channel: started.channel,
        provider: started.provider,
        providerKey: started.providerKey,
        localCodeHash: started.localCodeHash,
        status: 'PENDING',
        resendCount,
        nextAllowedAt,
        expiresAt,
      },
    });

    this.logger.log('auth.password_recovery.started', {
      userId: user.id,
      clientIp,
      phone: started.normalizedPhone,
      sessionId: session.id,
    });

    return {
      message: started.message,
      sessionId: session.id,
      verificationId: session.id,
      phone: started.normalizedPhone,
      channel: started.channel,
      nextAllowedAt,
      expiresAt,
      resendCount,
    };
  }

  async confirmPasswordRecovery(dto: ConfirmPasswordRecoveryDto) {
    const session = await this.prisma.passwordResetSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session || session.status !== 'PENDING' || session.consumedAt) {
      throw new NotFoundException('Nenhuma recuperação de senha pendente foi encontrada.');
    }

    // BUG CORRIGIDO: a verificação de bloqueio deve ser feita com o dado
    // ATUALIZADO (após o increment), não com o valor obsoleto de 'session'.
    // Primeiro verifica expiração antes de consumir a tentativa.
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('O código expirou. Solicite um novo código.');
    }

    // Verifica limite ANTES do incremento para não consumir tentativa desnecessariamente
    if (
      session.attempts >= MAX_VERIFICATION_ATTEMPTS &&
      session.nextAllowedAt &&
      session.nextAllowedAt.getTime() > Date.now()
    ) {
      throw new HttpException(
        'Muitas tentativas erradas. Aguarde antes de solicitar novo código.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + this.authProtection.getVerificationBlockSeconds() * 1000);
      await this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { status: 'FAILED', nextAllowedAt: blockedUntil },
      });
      throw new HttpException(
        'Número máximo de tentativas excedido. Solicite um novo código mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const updated = await this.prisma.passwordResetSession.update({
      where: { id: session.id },
      data: { attempts: { increment: 1 } },
    });

    const providedHash = this.smsService.hashCode(dto.code.trim());
    if (!updated.localCodeHash || updated.localCodeHash !== providedHash) {
      if (updated.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        const blockedUntil = new Date(Date.now() + this.authProtection.getVerificationBlockSeconds() * 1000);
        await this.prisma.passwordResetSession.update({
          where: { id: session.id },
          data: { status: 'FAILED', nextAllowedAt: blockedUntil },
        });
        throw new HttpException(
          'Muitas tentativas erradas. Aguarde antes de solicitar novo código.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new BadRequestException('Código inválido.');
    }

    const now = new Date();
    const resetToken = this.smsService.generateSecureToken(24);
    const resetTokenTtlMinutes = Number(this.configService.get('PASSWORD_RESET_TOKEN_TTL_MINUTES') || 15);
    const resetTokenExpiresAt = new Date(Date.now() + resetTokenTtlMinutes * 60 * 1000);

    await this.prisma.passwordResetSession.update({
      where: { id: session.id },
      data: {
        status: 'VERIFIED',
        verifiedAt: now,
        resetTokenHash: this.smsService.hashValue(resetToken),
        resetTokenExpiresAt,
      },
    });

    return {
      message: 'Código confirmado. Agora você já pode cadastrar uma nova senha.',
      resetToken,
      resetTokenExpiresAt,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const resetTokenHash = this.smsService.hashValue(dto.resetToken.trim());

    const session = await this.prisma.passwordResetSession.findUnique({
      where: { resetTokenHash },
    });

    if (!session || session.status !== 'VERIFIED' || session.consumedAt) {
      throw new UnauthorizedException('Autorização inválida para redefinir a senha.');
    }

    if (session.resetTokenExpiresAt && session.resetTokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new UnauthorizedException('A autorização expirou. Solicite um novo código.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.getBcryptRounds());
    const consumedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: session.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { status: 'USED', consumedAt },
      }),
    ]);

    return {
      message: 'Senha alterada com sucesso. Faça login com a sua nova senha.',
      updatedAt: consumedAt,
      userId: session.userId,
    };
  }

  async startPhoneVerification(userId: string, dto: StartPhoneVerificationDto, clientIp: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const phone = this.normalizePhoneOrNull(dto.phone || user.phone);
    if (!phone) throw new BadRequestException('Informe um telefone para receber o código.');

    await this.authProtection.assertSmsRateLimit(clientIp, phone);
    await this.ensurePhoneAvailable(phone, userId);

    const latestSession = await this.prisma.phoneVerificationSession.findFirst({
      where: { userId, status: { in: ['PENDING', 'FAILED', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (latestSession?.nextAllowedAt && latestSession.nextAllowedAt.getTime() > Date.now()) {
      const remainingMs = latestSession.nextAllowedAt.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      throw new HttpException(
        `Aguarde ${remainingMinutes} min para solicitar outro código.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const recentCount = await this.prisma.phoneVerificationSession.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } },
    });
    const resendCount = Math.max(1, recentCount + 1);
    const lockSeconds = RESEND_LOCKS_IN_SECONDS[Math.min(resendCount - 1, RESEND_LOCKS_IN_SECONDS.length - 1)];
    const nextAllowedAt = new Date(Date.now() + lockSeconds * 1000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const started = await this.smsService.startVerification(phone, dto.channel || 'SMS');

    const session = await this.prisma.phoneVerificationSession.create({
      data: {
        userId,
        phone: started.normalizedPhone,
        channel: started.channel,
        provider: started.provider,
        providerKey: started.providerKey,
        localCodeHash: started.localCodeHash,
        status: 'PENDING',
        resendCount,
        nextAllowedAt,
        expiresAt,
      },
    });

    if (started.normalizedPhone !== user.phone) {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { phone: started.normalizedPhone, phoneVerifiedAt: null },
        });
      } catch (error) {
        this.handleUniqueConstraintError(error);
        throw error;
      }
    }

    this.logger.log('auth.phone_verification.started', {
      userId,
      clientIp,
      phone: started.normalizedPhone,
      sessionId: session.id,
    });

    return {
      message: started.message,
      sessionId: session.id,
      verificationId: session.id,
      phone: started.normalizedPhone,
      channel: started.channel,
      nextAllowedAt,
      expiresAt,
      resendCount,
    };
  }

  async confirmPhoneVerification(userId: string, dto: ConfirmPhoneVerificationDto) {
    const verificationId = dto.verificationId || dto.sessionId;

    const session = verificationId
      ? await this.prisma.phoneVerificationSession.findFirst({
          where: { id: verificationId, userId, status: 'PENDING' },
        })
      : await this.prisma.phoneVerificationSession.findFirst({
          where: { userId, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });

    if (!session) {
      throw new NotFoundException('Nenhuma verificação pendente encontrada.');
    }

    // BUG CORRIGIDO: verifica expiração primeiro, antes de consumir tentativa
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneVerificationSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('O código expirou. Solicite um novo código.');
    }

    if (
      session.attempts >= MAX_VERIFICATION_ATTEMPTS &&
      session.nextAllowedAt &&
      session.nextAllowedAt.getTime() > Date.now()
    ) {
      throw new HttpException(
        'Muitas tentativas erradas. Aguarde antes de solicitar novo código.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      const blockedUntil = new Date(Date.now() + this.authProtection.getVerificationBlockSeconds() * 1000);
      await this.prisma.phoneVerificationSession.update({
        where: { id: session.id },
        data: { status: 'FAILED', nextAllowedAt: blockedUntil },
      });
      throw new HttpException(
        'Número máximo de tentativas excedido. Solicite um novo código mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.ensurePhoneAvailable(session.phone, userId);

    if (session.provider === 'INTERNAL') {
      const updated = await this.prisma.phoneVerificationSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      const providedHash = this.smsService.hashCode(dto.code.trim());
      if (!updated.localCodeHash || updated.localCodeHash !== providedHash) {
        if (updated.attempts >= MAX_VERIFICATION_ATTEMPTS) {
          const blockedUntil = new Date(Date.now() + this.authProtection.getVerificationBlockSeconds() * 1000);
          await this.prisma.phoneVerificationSession.update({
            where: { id: session.id },
            data: { status: 'FAILED', nextAllowedAt: blockedUntil },
          });
          throw new HttpException(
            'Muitas tentativas erradas. Aguarde antes de solicitar novo código.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw new BadRequestException('Código inválido.');
      }
    }

    const now = new Date();

    try {
      await this.prisma.$transaction([
        this.prisma.phoneVerificationSession.update({
          where: { id: session.id },
          data: { status: 'VERIFIED', verifiedAt: now },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { phone: session.phone, phoneVerifiedAt: now },
        }),
      ]);
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }

    const refreshed = await this.usersService.findById(userId);

    return {
      message: 'Telefone verificado com sucesso.',
      verifiedAt: now,
      user: refreshed
        ? {
            id: refreshed.id,
            name: refreshed.name,
            email: refreshed.email,
            phone: refreshed.phone,
            role: refreshed.role,
            phoneVerifiedAt: (refreshed as any).phoneVerifiedAt ?? null,
            isPhoneVerified: Boolean((refreshed as any).phoneVerifiedAt),
          }
        : undefined,
    };
  }

  async getPhoneVerificationStatus(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const latestSession = await this.prisma.phoneVerificationSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      phone: user.phone,
      phoneVerifiedAt: (user as any).phoneVerifiedAt ?? null,
      isVerified: Boolean((user as any).phoneVerifiedAt),
      latestVerification: latestSession
        ? {
            id: latestSession.id,
            channel: latestSession.channel,
            status: latestSession.status,
            createdAt: latestSession.createdAt,
            expiresAt: latestSession.expiresAt,
            nextAllowedAt: latestSession.nextAllowedAt,
            resendCount: latestSession.resendCount,
          }
        : null,
    };
  }

  async registerPushToken(userId: string, dto: RegisterPushTokenDto) {
    const token = String(dto.expoPushToken || '').trim() || null;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token, expoPushTokenUpdatedAt: token ? new Date() : null },
    });
    return {
      success: true,
      expoPushToken: updated.expoPushToken,
      expoPushTokenUpdatedAt: (updated as any).expoPushTokenUpdatedAt ?? null,
    };
  }

  // ─── Helpers privados ────────────────────────────────────────────────────────

  /**
   * BUG CORRIGIDO: antes carregava TODOS os usuários em memória e filtrava em JS.
   * Agora faz query diretamente no banco com phoneVerifiedAt e isActive filtrados.
   */
  private async findUserByVerifiedPhone(normalizedPhone: string) {
    // Busca direto no banco em vez de carregar todos os usuários em memória
    return this.prisma.user.findFirst({
      where: {
        phone: normalizedPhone,
        phoneVerifiedAt: { not: null },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, phone: true, phoneVerifiedAt: true, isActive: true, deletedAt: true },
    });
  }

  private normalizePhoneOrNull(phone?: string | null) {
    const normalized = this.smsService.normalizePhone(String(phone || '').trim());
    return normalized || null;
  }

  private async ensureEmailAvailable(email: string) {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) throw new BadRequestException('E-mail já cadastrado');
  }

  /**
   * BUG CORRIGIDO: antes carregava TODOS os usuários ativos em memória.
   * Agora faz query direta via findMany apenas nos campos necessários,
   * evitando OOM com bases grandes.
   */
  private async ensurePhoneAvailable(phone: string | null, ignoreUserId?: string) {
    if (!phone) return;

    // Busca direto no banco pelo telefone normalizado em vez de carregar todos
    const existingUser = await this.prisma.user.findFirst({
      where: {
        phone,
        isActive: true,
        deletedAt: null,
        ...(ignoreUserId ? { id: { not: ignoreUserId } } : {}),
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Telefone já cadastrado em outra conta');
    }
  }

  private handleUniqueConstraintError(error: unknown): never | void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return;
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta?.target.join(',')
      : String(error.meta?.target || '');

    if (target.includes('email')) throw new BadRequestException('E-mail já cadastrado');
    if (target.includes('phone')) throw new BadRequestException('Telefone já cadastrado em outra conta');
    throw new BadRequestException('Já existe um cadastro com os dados informados');
  }

  private async generateTokens(user: User & Record<string, any>, sessionId: string = randomUUID()) {
    const accessTokenTtl = this.configService.get<string>('JWT_ACCESS_TOKEN_TTL') || '15m';
    const refreshTokenTtl = this.configService.get<string>('JWT_REFRESH_TOKEN_TTL') || '7d';
    const payload: AuthJwtPayload = { sub: user.id, email: user.email, role: user.role, sessionId };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: accessTokenTtl as any,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTokenTtl as any,
    });

    const accessTokenExpiresAt = this.calculateExpiryDate(accessTokenTtl);
    const refreshTokenExpiresAt = this.calculateExpiryDate(refreshTokenTtl);

    await this.writeRefreshSession(
      sessionId,
      {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        createdAt: new Date().toISOString(),
        refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      },
      refreshTokenExpiresAt,
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        phoneVerifiedAt: user.phoneVerifiedAt ?? null,
        isPhoneVerified: Boolean(user.phoneVerifiedAt),
      },
      accessToken,
      refreshToken,
      tokenMeta: {
        sessionId,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      },
    };
  }

  private hashRefreshToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private getBcryptRounds() {
    const rounds = Number(this.configService.get<string>('BCRYPT_ROUNDS', '10'));
    return Number.isFinite(rounds) && rounds >= 8 && rounds <= 15 ? rounds : 10;
  }

  private getRefreshSessionKey(sessionId: string) {
    return `auth:refresh-session:${sessionId}`;
  }

  private async readRefreshSession(sessionId: string) {
    return this.ephemeralStore.get<{
      userId: string;
      refreshTokenHash: string;
      createdAt: string;
      refreshTokenExpiresAt: string;
    }>(this.getRefreshSessionKey(sessionId));
  }

  private async writeRefreshSession(
    sessionId: string,
    value: { userId: string; refreshTokenHash: string; createdAt: string; refreshTokenExpiresAt: string },
    refreshTokenExpiresAt: Date,
  ) {
    const ttlSeconds = Math.max(1, Math.ceil((refreshTokenExpiresAt.getTime() - Date.now()) / 1000));
    await this.ephemeralStore.set(this.getRefreshSessionKey(sessionId), value, ttlSeconds);
  }

  private async deleteRefreshSession(sessionId: string) {
    await this.ephemeralStore.delete(this.getRefreshSessionKey(sessionId));
  }

  private calculateExpiryDate(ttl: string) {
    const now = Date.now();
    const match = ttl.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return new Date(now + 15 * 60 * 1000);
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier =
      unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return new Date(now + value * multiplier);
  }
}
