import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';

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
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        phone: data.phone,
        role: data.role ?? Role.USER,
      },
    });
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
