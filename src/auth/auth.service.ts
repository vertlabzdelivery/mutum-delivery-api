import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { RegisterDto } from './dto/register.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';
import { ConfirmPhoneVerificationDto } from './dto/confirm-phone-verification.dto';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
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
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) throw new BadRequestException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      passwordHash,
      phone: dto.phone?.trim(),
      role: Role.USER,
    });

    return this.generateTokens(user as any);
  }

  async registerRestaurant(dto: RegisterRestaurantDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) throw new BadRequestException('E-mail já cadastrado');

    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
      if (!city) throw new NotFoundException('Cidade não encontrada');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.ownerName.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          phone: dto.ownerPhone?.trim(),
          role: Role.RESTAURANT,
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.restaurantName.trim(),
          description: dto.restaurantDescription?.trim(),
          logoUrl: dto.restaurantLogoUrl?.trim(),
          phone: dto.restaurantPhone?.trim(),
          address: dto.address.trim(),
          cityId: dto.cityId,
          ownerId: user.id,
        },
      });

      return { user, restaurant };
    });

    const tokens = await this.generateTokens(result.user as any);
    return { ...tokens, restaurant: result.restaurant };
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

  async startPhoneVerification(userId: string, dto: StartPhoneVerificationDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuário não encontrado');

    const phone = String(dto.phone || user.phone || '').trim();
    if (!phone) throw new BadRequestException('Informe um telefone para receber o código.');

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
    const resendCount = recentCount + 1;
    const nextSeconds = RESEND_LOCKS_IN_SECONDS[Math.min(resendCount - 1, RESEND_LOCKS_IN_SECONDS.length - 1)];
    const started = await this.smsService.startVerification(phone, dto.channel || 'SMS');

    const session = await this.prisma.phoneVerificationSession.create({
      data: {
        userId: user.id,
        phone: started.normalizedPhone,
        channel: started.channel,
        provider: 'INTERNAL',
        providerKey: started.providerKey,
        localCodeHash: started.localCodeHash,
        status: 'PENDING',
        resendCount,
        nextAllowedAt: new Date(Date.now() + nextSeconds * 1000),
        expiresAt: new Date(Date.now() + 1000 * 60 * 10),
      },
    });

    if (phone !== user.phone) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phone, phoneVerifiedAt: null },
      });
    }

    return {
      verificationId: session.id,
      phone,
      normalizedPhone: started.normalizedPhone,
      channel: started.channel,
      message: started.message,
      nextRetryAt: session.nextAllowedAt,
      resendCount,
    };
  }

  async confirmPhoneVerification(userId: string, dto: ConfirmPhoneVerificationDto) {
    const session = await this.prisma.phoneVerificationSession.findFirst({
      where: { id: dto.verificationId, userId },
    });
    if (!session) throw new NotFoundException('Solicitação de verificação não encontrada.');
    if (session.status === 'VERIFIED') return { verified: true, message: 'Telefone já verificado.' };
    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
      throw new BadRequestException('Limite de tentativas atingido. Solicite um novo código.');
    }
    if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
      await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('O código expirou. Solicite um novo código.');
    }

    const ok = Boolean(session.localCodeHash) && this.smsService.hashCode(dto.code.trim()) === session.localCodeHash;
    if (!ok) {
      const updated = await this.prisma.phoneVerificationSession.update({
        where: { id: session.id },
        data: { attempts: { increment: 1 } },
      });
      if (updated.attempts >= MAX_VERIFICATION_ATTEMPTS) {
        await this.prisma.phoneVerificationSession.update({ where: { id: session.id }, data: { status: 'FAILED' } });
      }
      throw new BadRequestException('Código inválido. Confira o SMS e tente novamente.');
    }

    await this.prisma.$transaction([
      this.prisma.phoneVerificationSession.update({
        where: { id: session.id },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { phone: session.phone, phoneVerifiedAt: new Date() },
      }),
    ]);

    const refreshed = await this.usersService.findById(userId);
    return {
      verified: true,
      message: 'Telefone confirmado com sucesso.',
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
