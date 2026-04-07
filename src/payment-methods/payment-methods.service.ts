import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin() {
    const items = await this.prisma.paymentMethodOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map((item) => this.serializePaymentMethod(item));
  }

  async listActive() {
    const items = await this.prisma.paymentMethodOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return items.map((item) => this.serializePaymentMethod(item));
  }

  async create(dto: CreatePaymentMethodDto) {
    const existing = await this.prisma.paymentMethodOption.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('Já existe um método de pagamento cadastrado para este código.');
    }
    const created = await this.prisma.paymentMethodOption.create({
      data: {
        code: dto.code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.serializePaymentMethod(created);
  }

  async update(id: string, dto: UpdatePaymentMethodDto) {
    await this.ensurePaymentMethodExists(id);
    const updated = await this.prisma.paymentMethodOption.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        icon: dto.icon !== undefined ? dto.icon?.trim() || null : undefined,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    return this.serializePaymentMethod(updated);
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.ensurePaymentMethodExists(id);
    const updated = await this.prisma.paymentMethodOption.update({
      where: { id },
      data: { isActive },
    });
    return this.serializePaymentMethod(updated);
  }

  async getRestaurantPaymentMethods(restaurantId: string, currentUser?: CurrentUserData) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurante não encontrado');
    if (currentUser) this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    return this.loadRestaurantPaymentMethods(restaurantId, Boolean(currentUser));
  }

  async getMyRestaurantPaymentMethods(currentUser: CurrentUserData) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { ownerId: currentUser.userId },
      select: { id: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurante não encontrado para este usuário.');
    return this.loadRestaurantPaymentMethods(restaurant.id, true);
  }

  async updateRestaurantPaymentMethods(restaurantId: string, paymentMethodIds: string[], currentUser: CurrentUserData) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurante não encontrado');
    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    const activeMethods = await this.prisma.paymentMethodOption.findMany({
      where: {
        id: { in: paymentMethodIds },
        isActive: true,
      },
      select: { id: true },
    });
    const foundIds = new Set(activeMethods.map((item) => item.id));
    const missing = paymentMethodIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException('Um ou mais métodos de pagamento não existem ou estão inativos.');
    }

    await this.prisma.$transaction([
      this.prisma.restaurantAcceptedPaymentMethod.deleteMany({ where: { restaurantId } }),
      ...(paymentMethodIds.length
        ? [
            this.prisma.restaurantAcceptedPaymentMethod.createMany({
              data: paymentMethodIds.map((paymentMethodOptionId) => ({ restaurantId, paymentMethodOptionId })),
            }),
          ]
        : []),
    ]);

    return this.loadRestaurantPaymentMethods(restaurantId, true);
  }

  async ensureRestaurantAcceptsPaymentMethod(
    tx: PrismaService | Prisma.TransactionClient,
    restaurantId: string,
    paymentMethod: PaymentMethod,
  ) {
    const totalMethods = await tx.paymentMethodOption.count();
    if (totalMethods === 0) {
      return { id: paymentMethod, isActive: true, name: paymentMethod };
    }

    const activeMethod = await tx.paymentMethodOption.findUnique({
      where: { code: paymentMethod },
      select: { id: true, isActive: true, name: true },
    });

    if (!activeMethod || !activeMethod.isActive) {
      throw new BadRequestException('Este método de pagamento não está disponível no momento.');
    }

    const selected = await tx.restaurantAcceptedPaymentMethod.findMany({
      where: { restaurantId },
      select: { paymentMethodOptionId: true },
      take: 20,
    });

    if (!selected.length) {
      return activeMethod;
    }

    if (!selected.some((item) => item.paymentMethodOptionId === activeMethod.id)) {
      throw new BadRequestException('Este restaurante não aceita esse método de pagamento.');
    }

    return activeMethod;
  }

  private async loadRestaurantPaymentMethods(restaurantId: string, includeInactive = false) {
    const [allMethods, selected] = await Promise.all([
      this.prisma.paymentMethodOption.findMany({
        where: includeInactive ? undefined : { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.restaurantAcceptedPaymentMethod.findMany({
        where: { restaurantId },
        select: { paymentMethodOptionId: true },
      }),
    ]);

    const selectedIds = new Set(selected.map((item) => item.paymentMethodOptionId));
    const effectiveSelectedIds = selectedIds.size ? selectedIds : new Set(allMethods.filter((item) => item.isActive).map((item) => item.id));

    return {
      restaurantId,
      items: allMethods.map((item) => ({
        ...this.serializePaymentMethod(item),
        selected: effectiveSelectedIds.has(item.id),
      })),
      hasCustomSelection: selectedIds.size > 0,
    };
  }

  private async ensurePaymentMethodExists(id: string) {
    const item = await this.prisma.paymentMethodOption.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Método de pagamento não encontrado.');
    return item;
  }

  private ensureCanManageRestaurant(ownerId: string, currentUser: CurrentUserData) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = currentUser.role === Role.RESTAURANT && currentUser.userId === ownerId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('Você não tem permissão para gerenciar este restaurante.');
    }
  }

  private serializePaymentMethod(item: any) {
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      description: item.description ?? null,
      icon: item.icon ?? null,
      sortOrder: Number(item.sortOrder ?? 0),
      isActive: item.isActive !== false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
