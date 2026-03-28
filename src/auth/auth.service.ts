import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { RegisterDto } from './dto/register.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { StartPasswordRecoveryDto } from './dto/start-password-recovery.dto';
import { ConfirmPasswordRecoveryDto } from './dto/confirm-password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ApiBrasilSmsService } from './apibrasil-sms.service';

const RESEND_LOCKS_IN_SECONDS = [60, 300, 600, 900, 1800, 3600];
const MAX_VERIFICATION_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: ApiBrasilSmsService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = this.normalizePhoneOrNull(dto.phone);

    await this.ensureEmailAvailable(email);
    await this.ensurePhoneAvailable(phone);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.usersService.create({
        name: dto.name.trim(),
        email,
        passwordHash,
        phone: phone ?? undefined,
        role: Role.USER,
      });

      return this.generateTokens(user as any);
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

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: dto.ownerName.trim(),
            email,
            passwordHash,
            phone: ownerPhone,
            role: Role.RESTAURANT,
          },
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

      const tokens = await this.generateTokens(result.user as any);
      return { ...tokens, restaurant: result.restaurant };
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email.trim().toLowerCase());
    if (!user) throw new UnauthorizedException('Credenciais inválidas');

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Credenciais inválidas');

    return this.generateTokens(user as any);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException('Usuário não encontrado');
      return this.generateTokens(user as any);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');
    const { passwordHash, ...rest } = user as any;
    return { ...rest, isPhoneVerified: Boolean((user as any).phoneVerifiedAt) };
  }


  async startPasswordRecovery(dto: StartPasswordRecoveryDto) {
    const phone = this.normalizePhoneOrNull(dto.phone);
    if (!phone) {
      throw new BadRequestException('Informe um telefone válido para recuperar a senha.');
    }

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
      throw new BadRequestException(`Aguarde ${remainingMinutes} min para solicitar outro código.`);
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

    return {
      message: started.message,
      sessionId: session.id,
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

    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.prisma.passwordResetSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
      throw new BadRequestException('Número máximo de tentativas excedido. Solicite um novo código.');
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('O código expirou. Solicite um novo código.');
    }

    const updated = await this.prisma.passwordResetSession.update({
      where: { id: session.id },
      data: { attempts: { increment: 1 } },
    });

    const providedHash = this.smsService.hashCode(dto.code.trim());
    if (!updated.localCodeHash || updated.localCodeHash !== providedHash) {
      if (updated.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        await this.prisma.passwordResetSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
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

    const session = await this.prisma.passwordResetSession.findFirst({
      where: {
        resetTokenHash,
        status: 'VERIFIED',
      },
      include: { user: true },
    });

    if (!session || session.consumedAt) {
      throw new BadRequestException('A autorização para redefinir a senha é inválida.');
    }

    if (session.resetTokenExpiresAt && session.resetTokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('A autorização expirou. Solicite um novo código.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const consumedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: session.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetSession.update({
        where: { id: session.id },
        data: {
          status: 'USED',
          consumedAt,
        },
      }),
    ]);

    return {
      message: 'Senha alterada com sucesso. Faça login com a sua nova senha.',
      updatedAt: consumedAt,
      userId: session.userId,
    };
  }

  async startPhoneVerification(userId: string, dto: StartPhoneVerificationDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const phone = this.normalizePhoneOrNull(dto.phone || user.phone);
    if (!phone) throw new BadRequestException('Informe um telefone para receber o código.');

    await this.ensurePhoneAvailable(phone, userId);

    const latestSession = await this.prisma.phoneVerificationSession.findFirst({
      where: { userId, status: { in: ['PENDING', 'FAILED', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (latestSession?.nextAllowedAt && latestSession.nextAllowedAt.getTime() > Date.now()) {
      const remainingMs = latestSession.nextAllowedAt.getTime() - Date.now();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
      throw new BadRequestException(`Aguarde ${remainingMinutes} min para solicitar outro código.`);
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

    return {
      message: started.message,
      sessionId: session.id,
      phone: started.normalizedPhone,
      channel: started.channel,
      nextAllowedAt,
      expiresAt,
      resendCount,
    };
  }

  async confirmPhoneVerification(userId: string, dto: ConfirmPhoneVerificationDto) {
    const session = dto.verificationId
      ? await this.prisma.phoneVerificationSession.findFirst({
          where: { id: dto.verificationId, userId, status: 'PENDING' },
        })
      : await this.prisma.phoneVerificationSession.findFirst({
          where: { userId, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
        });

    if (!session) {
      throw new NotFoundException('Nenhuma verificação pendente encontrada.');
    }

    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
      throw new BadRequestException('Número máximo de tentativas excedido. Solicite um novo código.');
    }

    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('O código expirou. Solicite um novo código.');
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
          await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
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
    const latestSession = await this.prisma.phoneVerificationSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
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
    return { success: true, expoPushToken: updated.expoPushToken, expoPushTokenUpdatedAt: (updated as any).expoPushTokenUpdatedAt ?? null };
  }


  private async findUserByVerifiedPhone(phone: string) {
    const usersWithPhone = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        phoneVerifiedAt: { not: null },
        isActive: true,
        deletedAt: null,
      },
    });

    return usersWithPhone.find((user) => this.normalizePhoneOrNull(user.phone) === phone) || null;
  }

  private normalizePhoneOrNull(phone?: string | null) {
    const normalized = this.smsService.normalizePhone(String(phone || '').trim());
    return normalized || null;
  }

  private async ensureEmailAvailable(email: string) {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) throw new BadRequestException('E-mail já cadastrado');
  }

  private async ensurePhoneAvailable(phone: string | null, ignoreUserId?: string) {
    if (!phone) return;

    const usersWithPhone = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, phone: true },
    });

    const alreadyUsed = usersWithPhone.some((user) => {
      if (ignoreUserId && user.id === ignoreUserId) return false;
      const normalizedExistingPhone = this.normalizePhoneOrNull(user.phone);
      return normalizedExistingPhone === phone;
    });

    if (alreadyUsed) {
      throw new BadRequestException('Telefone já cadastrado em outra conta');
    }
  }

  private handleUniqueConstraintError(error: unknown): never | void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta?.target.join(',') : String(error.meta?.target || '');

    if (target.includes('email')) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    if (target.includes('phone')) {
      throw new BadRequestException('Telefone já cadastrado em outra conta');
    }

    throw new BadRequestException('Já existe um cadastro com os dados informados');
  }

  private async generateTokens(user: User & Record<string, any>) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
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
    };
  }
}
