import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { generateReferralCode } from '../coupons/coupon-code.util';
import { PrismaService } from '../prisma/prisma.service';

type CreateUserParams = {
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
  role?: Role;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
      },
    });
  }

  async create(data: CreateUserParams): Promise<User> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        return await this.prisma.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash: data.passwordHash,
            phone: data.phone,
            role: data.role ?? Role.USER,
            referralCode: generateReferralCode(),
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          Array.isArray(error.meta?.target) &&
          (error.meta?.target as string[]).includes('referralCode')
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Não foi possível gerar um código de indicação único.');
  }

  async deleteMyAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.isActive === false) {
      throw new NotFoundException('Conta não encontrada ou já excluída.');
    }

    const timestamp = Date.now();
    const deletedAt = new Date();
    const replacementEmail = `deleted_${user.id}_${timestamp}@pedeuai.local`;
    const replacementPasswordHash = `deleted_${user.id}_${timestamp}`;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Conta excluída',
          email: replacementEmail,
          passwordHash: replacementPasswordHash,
          phone: null,
          phoneVerifiedAt: null,
          expoPushToken: null,
          expoPushTokenUpdatedAt: null,
          isActive: false,
          deletedAt,
        },
      }),
      this.prisma.userAddress.deleteMany({ where: { userId } }),
      this.prisma.restaurant.updateMany({ where: { ownerId: userId }, data: { isActive: false } }),
      this.prisma.phoneVerificationSession.deleteMany({ where: { userId } }),
      this.prisma.passwordResetSession.deleteMany({ where: { userId } }),
    ]);

    return {
      success: true,
      message: 'Conta excluída com sucesso.',
      deletedAt,
    };
  }
}
