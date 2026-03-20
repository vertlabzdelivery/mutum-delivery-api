import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingCycleStatus,
  OrderStatus,
  Prisma,
  Role,
} from '@prisma/client';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { PrismaService } from '../prisma/prisma.service';

type BillingOrderRow = {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  subtotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  total: Prisma.Decimal;
  deliveryName: string;
  deliveryPhone: string;
  deliveryDistrict: string;
  paymentMethod: string;
  notes: string | null;
  canceledAt: Date | null;
  deliveredAt: Date | null;
};

@Injectable()
export class BillingService {
  private readonly defaultCommissionPercent = 7;

  constructor(private readonly prisma: PrismaService) {}

  async getReport(
    currentUser: CurrentUserData,
    params: {
      restaurantId?: string;
      startDate: string;
      endDate: string;
      commissionPercent?: number;
    },
  ) {
    const { restaurant, range, commissionPercent } =
      await this.resolveRestaurantAndRange(currentUser, params);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        status: true,
        subtotal: true,
        deliveryFee: true,
        total: true,
        deliveryName: true,
        deliveryPhone: true,
        deliveryDistrict: true,
        paymentMethod: true,
        notes: true,
        canceledAt: true,
        deliveredAt: true,
      },
    });

    return this.buildReport({
      restaurant,
      orders,
      commissionPercent,
      startDate: range.start,
      endDate: range.end,
    });
  }

  async saveCycle(
    currentUser: CurrentUserData,
    params: {
      restaurantId: string;
      startDate: string;
      endDate: string;
      commissionPercent?: number;
      dueDate?: string;
      notes?: string;
    },
  ) {
    const report = await this.getReport(currentUser, params);
    const commissionRateDecimal = this.toRateDecimal(report.commission.percent);
    const dueDate = params.dueDate ? new Date(params.dueDate) : null;

    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Data de vencimento inválida');
    }

    const cycle = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.restaurantBillingCycle.upsert({
        where: {
          restaurantId_periodStart_periodEnd: {
            restaurantId: report.restaurant.id,
            periodStart: new Date(report.period.startDate),
            periodEnd: new Date(report.period.endDate),
          },
        },
        create: {
          restaurantId: report.restaurant.id,
          periodStart: new Date(report.period.startDate),
          periodEnd: new Date(report.period.endDate),
          referenceYear: new Date(report.period.startDate).getUTCFullYear(),
          referenceMonth: new Date(report.period.startDate).getUTCMonth() + 1,
          grossSales: new Prisma.Decimal(report.totals.grossSales),
          canceledSales: new Prisma.Decimal(report.totals.canceledSales),
          commissionRate: commissionRateDecimal,
          commissionAmount: new Prisma.Decimal(report.commission.amount),
          netSales: new Prisma.Decimal(report.totals.netSalesAfterCommission),
          totalOrders: report.totals.totalOrders,
          billedOrders: report.totals.billableOrders,
          canceledOrders: report.totals.canceledOrders,
          amountDue: new Prisma.Decimal(report.commission.amount),
          dueDate,
          notes: params.notes?.trim() || null,
          generatedByUserId: currentUser.userId,
          status:
            report.commission.amount > 0 ? BillingCycleStatus.OPEN : BillingCycleStatus.PAID,
        },
        update: {
          grossSales: new Prisma.Decimal(report.totals.grossSales),
          canceledSales: new Prisma.Decimal(report.totals.canceledSales),
          commissionRate: commissionRateDecimal,
          commissionAmount: new Prisma.Decimal(report.commission.amount),
          netSales: new Prisma.Decimal(report.totals.netSalesAfterCommission),
          totalOrders: report.totals.totalOrders,
          billedOrders: report.totals.billableOrders,
          canceledOrders: report.totals.canceledOrders,
          amountDue: new Prisma.Decimal(report.commission.amount),
          dueDate,
          notes: params.notes?.trim() || null,
          generatedByUserId: currentUser.userId,
          status:
            report.commission.amount > 0 ? BillingCycleStatus.OPEN : BillingCycleStatus.PAID,
        },
        include: {
          payments: true,
        },
      });

      await tx.restaurantBillingItem.deleteMany({
        where: { billingCycleId: upserted.id },
      });

      if (report.orders.length) {
        await tx.restaurantBillingItem.createMany({
          data: report.orders.map((order) => ({
            billingCycleId: upserted.id,
            orderId: order.id,
            orderTotal: new Prisma.Decimal(order.total),
            isCanceled: order.isCanceled,
            commissionBase: new Prisma.Decimal(order.commissionBase),
            commissionRate: commissionRateDecimal,
            commissionAmount: new Prisma.Decimal(order.commissionAmount),
          })),
        });
      }

      return tx.restaurantBillingCycle.findUnique({
        where: { id: upserted.id },
        include: {
          restaurant: {
            select: { id: true, name: true },
          },
          items: {
            include: {
              order: {
                select: {
                  id: true,
                  createdAt: true,
                  status: true,
                  total: true,
                  deliveryName: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          payments: {
            orderBy: { paidAt: 'desc' },
          },
        },
      });
    });

    return cycle;
  }

  async listCycles(
    currentUser: CurrentUserData,
    restaurantId?: string,
  ) {
    const scopedRestaurantId = await this.resolveRestaurantIdForCycleList(
      currentUser,
      restaurantId,
    );

    const cycles = await this.prisma.restaurantBillingCycle.findMany({
      where: scopedRestaurantId ? { restaurantId: scopedRestaurantId } : undefined,
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    });

    return cycles.map((cycle) => ({
      ...cycle,
      grossSales: this.decimalToNumber(cycle.grossSales),
      canceledSales: this.decimalToNumber(cycle.canceledSales),
      commissionRate: this.decimalToPercent(cycle.commissionRate),
      commissionAmount: this.decimalToNumber(cycle.commissionAmount),
      netSales: this.decimalToNumber(cycle.netSales),
      amountPaid: this.decimalToNumber(cycle.amountPaid),
      amountDue: this.decimalToNumber(cycle.amountDue),
      payments: cycle.payments.map((payment) => ({
        ...payment,
        amount: this.decimalToNumber(payment.amount),
      })),
    }));
  }

  private async resolveRestaurantAndRange(
    currentUser: CurrentUserData,
    params: {
      restaurantId?: string;
      startDate: string;
      endDate: string;
      commissionPercent?: number;
    },
  ) {
    const start = this.startOfDay(params.startDate);
    const end = this.endOfDay(params.endDate);

    if (end < start) {
      throw new BadRequestException(
        'A data final precisa ser igual ou posterior à data inicial',
      );
    }

    const restaurant = await this.resolveRestaurant(currentUser, params.restaurantId);
    const commissionPercent =
      params.commissionPercent ?? this.defaultCommissionPercent;

    return { restaurant, range: { start, end }, commissionPercent };
  }

  private async resolveRestaurant(
    currentUser: CurrentUserData,
    restaurantId?: string,
  ) {
    if (currentUser.role === Role.ADMIN) {
      if (!restaurantId) {
        throw new BadRequestException('Selecione um restaurante para gerar o relatório');
      }

      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true, ownerId: true },
      });

      if (!restaurant) {
        throw new NotFoundException('Restaurante não encontrado');
      }

      return restaurant;
    }

    const ownedRestaurants = await this.prisma.restaurant.findMany({
      where: { ownerId: currentUser.userId },
      select: { id: true, name: true, ownerId: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!ownedRestaurants.length) {
      throw new ForbiddenException('Sua conta não possui restaurante vinculado');
    }

    if (!restaurantId) {
      return ownedRestaurants[0];
    }

    const restaurant = ownedRestaurants.find((item) => item.id === restaurantId);

    if (!restaurant) {
      throw new ForbiddenException('Você não pode acessar o faturamento deste restaurante');
    }

    return restaurant;
  }

  private async resolveRestaurantIdForCycleList(
    currentUser: CurrentUserData,
    restaurantId?: string,
  ) {
    if (currentUser.role === Role.ADMIN) {
      return restaurantId;
    }

    const restaurant = await this.resolveRestaurant(currentUser, restaurantId);
    return restaurant.id;
  }

  private buildReport(params: {
    restaurant: { id: string; name: string };
    orders: BillingOrderRow[];
    commissionPercent: number;
    startDate: Date;
    endDate: Date;
  }) {
    const rate = params.commissionPercent / 100;

    let grossSales = 0;
    let canceledSales = 0;
    let billableOrders = 0;
    let canceledOrders = 0;

    const orders = params.orders.map((order, index) => {
      const total = this.decimalToNumber(order.total);
      const isCanceled = order.status === OrderStatus.CANCELED;
      const commissionBase = isCanceled ? 0 : total;
      const commissionAmount = this.roundCurrency(commissionBase * rate);

      if (isCanceled) {
        canceledSales += total;
        canceledOrders += 1;
      } else {
        grossSales += total;
        billableOrders += 1;
      }

      return {
        line: index + 1,
        id: order.id,
        createdAt: order.createdAt.toISOString(),
        status: order.status,
        paymentMethod: order.paymentMethod,
        customerName: order.deliveryName,
        customerPhone: order.deliveryPhone,
        district: order.deliveryDistrict,
        subtotal: this.decimalToNumber(order.subtotal),
        deliveryFee: this.decimalToNumber(order.deliveryFee),
        total,
        notes: order.notes,
        isCanceled,
        canceledAt: order.canceledAt?.toISOString() || null,
        deliveredAt: order.deliveredAt?.toISOString() || null,
        commissionBase: this.roundCurrency(commissionBase),
        commissionAmount,
      };
    });

    const commissionAmount = this.roundCurrency(grossSales * rate);
    const netSalesAfterCommission = this.roundCurrency(grossSales - commissionAmount);

    return {
      restaurant: params.restaurant,
      period: {
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
      },
      commission: {
        percent: params.commissionPercent,
        rate: this.roundRate(rate),
        amount: commissionAmount,
      },
      totals: {
        totalOrders: params.orders.length,
        billableOrders,
        canceledOrders,
        grossSales: this.roundCurrency(grossSales),
        canceledSales: this.roundCurrency(canceledSales),
        netSalesAfterCommission,
      },
      orders,
    };
  }

  private startOfDay(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data inicial inválida');
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data final inválida');
    }
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private decimalToNumber(value: Prisma.Decimal | number | string | null) {
    return value == null ? 0 : Number(value);
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }

  private roundRate(value: number) {
    return Number(value.toFixed(4));
  }

  private toRateDecimal(percent: number) {
    return new Prisma.Decimal((percent / 100).toFixed(4));
  }

  private decimalToPercent(value: Prisma.Decimal) {
    return Number((Number(value) * 100).toFixed(2));
  }
}
