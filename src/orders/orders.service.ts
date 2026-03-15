import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { ORDER_STATUS_FLOW } from './constants/order-status-flow';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    if (!restaurant.isActive) {
      throw new BadRequestException('Restaurante inativo');
    }

    const menuItemIds = dto.items.map((item) => item.menuItemId);

    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId: dto.restaurantId,
      },
    });

    if (menuItems.length !== dto.items.length) {
      throw new BadRequestException(
        'Um ou mais itens do pedido não pertencem ao restaurante',
      );
    }

    const unavailableItem = menuItems.find((item) => !item.isAvailable);

    if (unavailableItem) {
      throw new BadRequestException(
        `O item "${unavailableItem.name}" está indisponível`,
      );
    }

    let subtotal = new Prisma.Decimal(0);

    const orderItemsData = dto.items.map((item) => {
      const menuItem = menuItems.find((menu) => menu.id === item.menuItemId);

      if (!menuItem) {
        throw new BadRequestException('Item do cardápio não encontrado');
      }

      const selectionsTotal = (item.selections ?? []).reduce(
        (acc, selection) => {
          return acc.plus(new Prisma.Decimal(selection.price ?? 0));
        },
        new Prisma.Decimal(0),
      );

      const unitPrice = new Prisma.Decimal(menuItem.price).plus(selectionsTotal);
      const totalPrice = unitPrice.mul(item.quantity);

      subtotal = subtotal.plus(totalPrice);

      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        selections: {
          create: (item.selections ?? []).map((selection) => ({
            choiceName: selection.choiceName,
            price:
              selection.price !== undefined
                ? new Prisma.Decimal(selection.price)
                : null,
          })),
        },
      };
    });

    const deliveryFee = new Prisma.Decimal(0);
    const total = subtotal.plus(deliveryFee);

    return this.prisma.order.create({
      data: {
        userId,
        restaurantId: dto.restaurantId,
        paymentMethod: dto.paymentMethod,
        status: OrderStatus.PENDING,
        subtotal,
        deliveryFee,
        total,
        notes: dto.notes,
        deliveryName: dto.deliveryName,
        deliveryPhone: dto.deliveryPhone,
        deliveryStreet: dto.deliveryStreet,
        deliveryNumber: dto.deliveryNumber,
        deliveryDistrict: dto.deliveryDistrict,
        deliveryCity: dto.deliveryCity,
        deliveryState: dto.deliveryState,
        deliveryZipCode: dto.deliveryZipCode,
        deliveryComplement: dto.deliveryComplement,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: {
            selections: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });
  }

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        items: {
          include: {
            selections: true,
          },
        },
      },
    });
  }

  async findRestaurantOrders(
    restaurantId: string,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    return this.prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        items: {
          include: {
            selections: true,
          },
        },
      },
    });
  }

  async findOne(id: string, currentUser: CurrentUserData) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
        items: {
          include: {
            selections: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwnerUser = order.userId === currentUser.userId;
    const isRestaurantOwner = order.restaurant.ownerId === currentUser.userId;

    if (!isAdmin && !isOwnerUser && !isRestaurantOwner) {
      throw new ForbiddenException('Você não tem acesso a este pedido');
    }

    return order;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    currentUser: CurrentUserData,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    this.ensureCanManageRestaurant(order.restaurant.ownerId, currentUser);
    this.ensureValidStatusTransition(order.status, status);

    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: {
        items: {
          include: {
            selections: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  private ensureCanManageRestaurant(
    ownerId: string,
    currentUser: CurrentUserData,
  ) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = ownerId === currentUser.userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar os pedidos deste restaurante',
      );
    }
  }

  private ensureValidStatusTransition(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus,
  ) {
    if (currentStatus === nextStatus) {
      throw new BadRequestException(
        `O pedido já está com status ${currentStatus}`,
      );
    }

    const allowedNextStatuses = ORDER_STATUS_FLOW[currentStatus];

    if (!allowedNextStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Transição inválida: não é permitido alterar de ${currentStatus} para ${nextStatus}`,
      );
    }
  }
}