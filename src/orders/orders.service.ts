import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { AblyRealtimeService } from '../notifications/ably-realtime.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { ORDER_STATUS_FLOW } from './constants/order-status-flow';
import { CreateOrderDto } from './dto/create-order.dto';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentMethodsService } from '../payment-methods/payment-methods.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly ablyRealtimeService: AblyRealtimeService,
    private readonly logger: StructuredLoggerService,
    private readonly couponsService: CouponsService,
    private readonly paymentMethodsService: PaymentMethodsService,
  ) {}

  async quote(userId: string, dto: CreateOrderDto) {
    const draft = await this.buildOrderDraft(userId, dto);

    return {
      restaurant: draft.restaurant,
      address: draft.addressSummary,
      deliveryZone: draft.deliveryZoneSummary,
      paymentMethod: dto.paymentMethod,
      cashChangeFor: dto.cashChangeFor ?? null,
      items: draft.orderItemsPreview,
      subtotal: Number(draft.subtotal),
      deliveryFee: Number(draft.deliveryFee),
      discountAmount: Number(draft.discountAmount),
      total: Number(draft.total),
      couponCode: draft.coupon?.couponCode ?? null,
      couponType: draft.coupon?.couponType ?? null,
      notes: dto.notes ?? null,
    };
  }

  async create(userId: string, dto: CreateOrderDto) {
    const startedAt = Date.now();

    try {
      await this.ensureUserPhoneVerified(userId);
      const draft = await this.buildOrderDraft(userId, dto);

      const createdOrder = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            userId,
            restaurantId: dto.restaurantId,
            userAddressId: dto.userAddressId,
            neighborhoodName: draft.address.neighborhood.name,
            paymentMethod: dto.paymentMethod,
            status: OrderStatus.PENDING,
            subtotal: draft.subtotal,
            deliveryFee: draft.deliveryFee,
            discountAmount: draft.discountAmount,
            total: draft.total,
            couponCode: draft.coupon?.couponCode,
            couponType: draft.coupon?.couponType,
            promotionalCouponId: draft.coupon?.promotionalCouponId,
            referralOwnerUserId: draft.coupon?.referralOwnerUserId,
            referralRewardId: draft.coupon?.referralRewardId,
            notes: dto.notes?.trim(),
            cashChangeFor:
              dto.cashChangeFor !== undefined
                ? new Prisma.Decimal(dto.cashChangeFor)
                : null,

            deliveryName: dto.deliveryName.trim(),
            deliveryPhone: dto.deliveryPhone.trim(),
            deliveryStreet: draft.address.street,
            deliveryNumber: draft.address.number,
            deliveryDistrict: draft.address.neighborhood.name,
            deliveryCity: draft.address.city.name,
            deliveryState: draft.address.city.state.code,
            deliveryZipCode: draft.address.zipCode ?? '',
            deliveryComplement: draft.address.complement,
            deliveryReference: draft.address.reference,

            items: {
              create: draft.orderItemsCreateData,
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: OrderStatus.PENDING,
                changedByUserId: userId,
                note: 'Pedido criado',
              },
            },
          },
          include: this.orderInclude(),
        });

        await this.couponsService.registerCouponUsage(tx, {
          userId,
          orderId: created.id,
          coupon: draft.coupon,
        });

        return created;
      });

      this.logger.log('order.created', {
        orderId: createdOrder.id,
        restaurantId: dto.restaurantId,
        userId,
        total: Number(createdOrder.total),
        itemCount: dto.items.length,
        durationMs: Date.now() - startedAt,
      });

      await this.notifyRestaurantNewOrder(createdOrder.id);
      return createdOrder;
    } catch (error) {
      this.logger.error('order.create_failed', {
        restaurantId: dto.restaurantId,
        userId,
        userAddressId: dto.userAddressId,
        paymentMethod: dto.paymentMethod,
        itemCount: dto.items.length,
        durationMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      throw error;
    }
  }

  async findMyOrders(userId: string, page = 1, limit = 20) {
    // MELHORIA: paginação adicionada — sem isso, usuários com muitos pedidos
    // causariam respostas enormes e lentidão no banco
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: this.orderInclude(),
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findRestaurantOrders(
    restaurantId: string,
    currentUser: CurrentUserData,
    page = 1,
    limit = 30,
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

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: this.orderInclude(true),
      }),
      this.prisma.order.count({ where: { restaurantId } }),
    ]);

    return {
      data: orders,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findOne(id: string, currentUser: CurrentUserData) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...this.orderInclude(true),
        restaurant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            logoUrl: true,
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
    note?: string,
  ) {
    // Usa transação com verificação atômica para evitar race condition
    // onde dois requests simultâneos poderiam ambos ler o mesmo status
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
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

      const now = new Date();

      return tx.order.update({
        where: { id },
        data: {
          status,
          acceptedAt: status === OrderStatus.ACCEPTED ? now : undefined,
          preparingAt: status === OrderStatus.PREPARING ? now : undefined,
          deliveryAt: status === OrderStatus.DELIVERY ? now : undefined,
          deliveredAt: status === OrderStatus.DELIVERED ? now : undefined,
          canceledAt: status === OrderStatus.CANCELED ? now : undefined,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: status,
              changedByUserId: currentUser.userId,
              note: note?.trim(),
            },
          },
        },
        include: this.orderInclude(true),
      });
    });

    // Notificações fora da transação para não bloquear o banco
    await this.couponsService.handleOrderStatusChange(id, status).catch((err) => {
      this.logger.error('order.coupon_status_change_failed', {
        orderId: id,
        status,
        error: err instanceof Error ? err.message : 'unknown',
      });
    });

    await this.notifyOrderStatusChange(updated as any);

    // Publica evento Ably para o painel do restaurante atualizar em tempo real
    await this.ablyRealtimeService.publishOrderStatusChanged(updated.restaurantId, {
      orderId: id,
      previousStatus: (updated as any).statusHistory?.[0]?.fromStatus ?? 'UNKNOWN',
      newStatus: status,
      note: note?.trim() ?? null,
    });

    return updated;
  }


  private async ensureUserPhoneVerified(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneVerifiedAt: true },
    });
    if (!user?.phoneVerifiedAt) {
      throw new BadRequestException('Seu telefone precisa ser verificado antes de finalizar o pedido.');
    }
  }

  private async notifyOrderStatusChange(order: any) {
    if (!order?.id) return;
    const orderWithUser = await this.prisma.order.findUnique({
      where: { id: order.id },
      select: {
        id: true,
        status: true,
        restaurant: { select: { name: true } },
        user: { select: { expoPushToken: true } },
      },
    });
    const expoPushToken = (orderWithUser as any)?.user?.expoPushToken;
    if (!expoPushToken) return;
    const statusMap: Record<string, string> = {
      PENDING: 'Pedido recebido',
      ACCEPTED: 'Pedido aceito',
      PREPARING: 'Pedido em produção',
      DELIVERY: 'Saiu para entrega',
      DELIVERED: 'Pedido entregue',
      CANCELED: 'Pedido cancelado',
    };
    const title = (orderWithUser as any)?.restaurant?.name || 'UaiPede';
    const body = `${statusMap[(orderWithUser as any)?.status || ''] || 'Atualização no pedido'} • Pedido #${String(order.id).slice(0, 8)}`;
    const result = await this.pushNotificationsService.sendToExpoPushToken(expoPushToken, {
      title,
      body,
      data: {
        type: 'ORDER_STATUS_CHANGED',
        orderId: order.id,
        status: (orderWithUser as any)?.status,
      },
    });

    if (!result.ok && !result.skipped) {
      this.logger.warn('order.status_push_failed', { orderId: order.id, status: (orderWithUser as any)?.status, result });
    }
  }


  private async notifyRestaurantNewOrder(orderId: string) {
    if (!orderId) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        total: true,
        deliveryName: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            owner: {
              select: {
                expoPushToken: true,
              },
            },
          },
        },
      },
    });

    if (!order?.restaurant?.id) return;

    const expoPushToken = order?.restaurant?.owner?.expoPushToken;
    const title = order?.restaurant?.name || 'Novo pedido';
    const body = `Novo pedido #${String(order?.id).slice(0, 8)} • ${order?.deliveryName} • R$ ${Number(order?.total || 0).toFixed(2).replace('.', ',')}`;

    if (expoPushToken) {
      const result = await this.pushNotificationsService.sendToExpoPushToken(expoPushToken, {
        title,
        body,
        data: {
          type: 'NEW_ORDER',
          orderId: order.id,
          restaurantId: order.restaurant?.id,
        },
      });

      if (!result.ok && !result.skipped) {
        this.logger.warn('order.new_order_push_failed', { orderId: order.id, restaurantId: order.restaurant?.id, result });
      }
    }

    await this.ablyRealtimeService.publishNewOrder(order.restaurant.id, {
      type: 'NEW_ORDER',
      orderId: order.id,
      shortOrderId: String(order.id).slice(0, 8),
      restaurantName: order.restaurant?.name || 'Restaurante',
      customerName: order.deliveryName,
      total: Number(order.total),
    });
  }

  private async buildOrderDraft(userId: string, dto: CreateOrderDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      include: {
        city: {
          include: {
            state: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    if (!restaurant.isActive) {
      throw new BadRequestException('Restaurante inativo');
    }

    const address = await this.prisma.userAddress.findFirst({
      where: {
        id: dto.userAddressId,
        userId,
      },
      include: {
        city: {
          include: {
            state: true,
          },
        },
        neighborhood: true,
      },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    if (restaurant.cityId && restaurant.cityId !== address.cityId) {
      throw new BadRequestException(
        'O restaurante não atende a cidade do endereço selecionado',
      );
    }

    const deliveryZone = await this.prisma.restaurantDeliveryZone.findFirst({
      where: {
        restaurantId: dto.restaurantId,
        neighborhoodId: address.neighborhoodId,
        isActive: true,
      },
      include: {
        neighborhood: true,
      },
    });

    if (!deliveryZone) {
      throw new BadRequestException(
        'Este restaurante não atende o bairro do endereço selecionado',
      );
    }

    const menuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];

    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId: dto.restaurantId,
      },
      include: {
        category: true,
        options: {
          where: { isActive: true },
          include: {
            choices: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (menuItems.length !== menuItemIds.length) {
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

    const orderItemsCreateData = dto.items.map((itemDto) => {
      const menuItem = menuItems.find((menu) => menu.id === itemDto.menuItemId);

      if (!menuItem) {
        throw new BadRequestException('Item do cardápio não encontrado');
      }

      if (
        menuItem.maxPerOrder !== null &&
        menuItem.maxPerOrder !== undefined &&
        itemDto.quantity > menuItem.maxPerOrder
      ) {
        throw new BadRequestException(
          `O item "${menuItem.name}" aceita no máximo ${menuItem.maxPerOrder} unidade(s) por pedido`,
        );
      }

      if (itemDto.notes && !menuItem.allowsItemNotes) {
        throw new BadRequestException(
          `O item "${menuItem.name}" não aceita observações personalizadas`,
        );
      }

      const selectedChoicePairs = itemDto.selectedChoices ?? [];
      const duplicateCheck = new Set<string>();

      for (const pair of selectedChoicePairs) {
        const key = `${pair.optionId}:${pair.choiceId}`;
        if (duplicateCheck.has(key)) {
          throw new BadRequestException(
            `Seleção duplicada encontrada no item "${menuItem.name}"`,
          );
        }
        duplicateCheck.add(key);
      }

      const validOptionIds = new Set(menuItem.options.map((option) => option.id));

      for (const pair of selectedChoicePairs) {
        if (!validOptionIds.has(pair.optionId)) {
          throw new BadRequestException(
            `Uma seleção enviada não pertence ao item "${menuItem.name}"`,
          );
        }
      }

      const selectionsForCreate: Array<{
        optionId: string;
        optionName: string;
        choiceId: string;
        choiceName: string;
        price: Prisma.Decimal | null;
      }> = [];

      for (const option of menuItem.options) {
        const selectedForOption = selectedChoicePairs.filter(
          (pair) => pair.optionId === option.id,
        );

        const minSelect = option.minSelect ?? (option.required ? 1 : 0);
        const maxSelect = option.maxSelect ?? null;
        const selectedCount = selectedForOption.length;

        if (option.required && selectedCount < minSelect) {
          throw new BadRequestException(
            `O grupo "${option.name}" do item "${menuItem.name}" exige ao menos ${minSelect} seleção(ões)`,
          );
        }

        if (selectedCount < minSelect) {
          throw new BadRequestException(
            `O grupo "${option.name}" do item "${menuItem.name}" exige no mínimo ${minSelect} seleção(ões)`,
          );
        }

        if (maxSelect !== null && selectedCount > maxSelect) {
          throw new BadRequestException(
            `O grupo "${option.name}" do item "${menuItem.name}" permite no máximo ${maxSelect} seleção(ões)`,
          );
        }

        for (const pair of selectedForOption) {
          const choice = option.choices.find((optionChoice) => optionChoice.id === pair.choiceId);

          if (!choice) {
            throw new BadRequestException(
              `A escolha informada não pertence ao grupo "${option.name}" do item "${menuItem.name}"`,
            );
          }

          selectionsForCreate.push({
            optionId: option.id,
            optionName: option.name,
            choiceId: choice.id,
            choiceName: choice.name,
            price:
              choice.price !== null && choice.price !== undefined
                ? new Prisma.Decimal(choice.price)
                : null,
          });
        }
      }

      const selectionsTotal = selectionsForCreate.reduce(
        (acc, selection) => acc.plus(selection.price ?? 0),
        new Prisma.Decimal(0),
      );

      const baseUnitPrice = new Prisma.Decimal(menuItem.price);
      const unitPrice = baseUnitPrice.plus(selectionsTotal);
      const totalPrice = unitPrice.mul(itemDto.quantity);

      subtotal = subtotal.plus(totalPrice);

      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        description: menuItem.description,
        imageUrl: menuItem.imageUrl,
        quantity: itemDto.quantity,
        baseUnitPrice,
        unitPrice,
        totalPrice,
        notes: itemDto.notes?.trim(),
        selections: {
          create: selectionsForCreate,
        },
      };
    });

    const deliveryFee = new Prisma.Decimal(deliveryZone.deliveryFee);
    const coupon = await this.couponsService.resolveCouponForOrder(this.prisma, {
      userId,
      restaurantId: dto.restaurantId,
      couponCode: dto.couponCode,
      subtotal,
      deliveryFee,
    });
    const discountAmount = coupon?.discountAmount ?? new Prisma.Decimal(0);
    const total = Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.plus(deliveryFee).minus(discountAmount));

    if (restaurant.minOrder && subtotal.lessThan(restaurant.minOrder)) {
      throw new BadRequestException(
        `O pedido mínimo deste restaurante é R$ ${restaurant.minOrder.toString()}`,
      );
    }

    await this.paymentMethodsService.ensureRestaurantAcceptsPaymentMethod(
      this.prisma,
      dto.restaurantId,
      dto.paymentMethod,
    );

    if (dto.paymentMethod === PaymentMethod.CASH) {
      if (
        dto.cashChangeFor !== undefined &&
        new Prisma.Decimal(dto.cashChangeFor).lessThan(total)
      ) {
        throw new BadRequestException(
          'O valor informado para troco precisa ser maior ou igual ao total do pedido',
        );
      }
    }

    if (dto.paymentMethod !== PaymentMethod.CASH && dto.cashChangeFor !== undefined) {
      throw new BadRequestException(
        'O campo cashChangeFor só pode ser usado quando o pagamento for em dinheiro',
      );
    }

    return {
      restaurant,
      address,
      deliveryZone,
      subtotal,
      deliveryFee,
      discountAmount,
      total,
      coupon,
      orderItemsCreateData,
      orderItemsPreview: orderItemsCreateData.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        baseUnitPrice: Number(item.baseUnitPrice),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        notes: item.notes ?? null,
        selections: item.selections.create.map((selection) => ({
          optionId: selection.optionId,
          optionName: selection.optionName,
          choiceId: selection.choiceId,
          choiceName: selection.choiceName,
          price: selection.price !== null ? Number(selection.price) : 0,
        })),
      })),
      addressSummary: {
        label: address.label,
        street: address.street,
        number: address.number,
        complement: address.complement,
        reference: address.reference,
        neighborhood: address.neighborhood.name,
        city: address.city.name,
        state: address.city.state.code,
        zipCode: address.zipCode,
      },
      deliveryZoneSummary: {
        neighborhood: deliveryZone.neighborhood.name,
        deliveryFee: Number(deliveryFee),
        minTime: deliveryZone.minTime,
        maxTime: deliveryZone.maxTime,
      },
    };
  }

  private orderInclude(includeUser = false) {
    return {
      ...(includeUser
        ? {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          }
        : {}),
      restaurant: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          phone: true,
        },
      },
      items: {
        include: {
          selections: true,
        },
      },
      statusHistory: {
        include: {
          changedByUser: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      },
    } as const;
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
