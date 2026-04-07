import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponType,
  DiscountType,
  OrderStatus,
  Prisma,
  ReferralRewardStatus,
  ReferralUsageStatus,
  Role,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { generateReferralRewardCode, isAlphanumericCouponCode, normalizeCouponCode } from './coupon-code.util';
import { CouponOrderResolution, CouponValidationOutput, CouponValidationResult } from './coupon.types';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CreatePromotionalCouponDto } from './dto/create-promotional-coupon.dto';
import { UpdatePromotionalCouponDto } from './dto/update-promotional-coupon.dto';
import { ListPromotionalCouponsDto } from './dto/list-promotional-coupons.dto';
import { AblyRealtimeService } from '../notifications/ably-realtime.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ablyRealtimeService: AblyRealtimeService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async validateCouponPreview(userId: string, dto: ValidateCouponDto) {
    const subtotal = new Prisma.Decimal(dto.subtotal);
    const deliveryFee = new Prisma.Decimal(dto.deliveryFee ?? 0);
    const result = await this.validateCouponCore(this.prisma, {
      userId,
      restaurantId: dto.restaurantId,
      couponCode: dto.couponCode,
      subtotal,
      deliveryFee,
    });

    return this.serializeValidationResult(result);
  }

  async resolveCouponForOrder(
    tx: PrismaService | Prisma.TransactionClient,
    params: {
      userId: string;
      restaurantId: string;
      couponCode?: string;
      subtotal: Prisma.Decimal;
      deliveryFee: Prisma.Decimal;
    },
  ): Promise<CouponOrderResolution | null> {
    if (!params.couponCode) {
      return null;
    }

    const validation = await this.validateCouponCore(tx, {
      ...params,
      couponCode: params.couponCode,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.message);
    }

    return {
      couponCode: validation.couponCode,
      couponType: validation.type,
      discountAmount: validation.discountAmount,
      promotionalCouponId: validation.promotionalCouponId,
      referralOwnerUserId: validation.referralOwnerUserId,
      referralRewardId: validation.referralRewardId,
    };
  }

  async registerCouponUsage(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      orderId: string;
      coupon: CouponOrderResolution | null;
    },
  ) {
    if (!params.coupon) return;

    const { coupon } = params;

    if (coupon.couponType === CouponType.PROMOTIONAL && coupon.promotionalCouponId) {
      const currentCoupon = await tx.promotionalCoupon.findUnique({
        where: { id: coupon.promotionalCouponId },
        select: { id: true, isActive: true, usedCount: true, maxUses: true },
      });
      if (!currentCoupon || !currentCoupon.isActive || currentCoupon.usedCount >= currentCoupon.maxUses) {
        throw new ConflictException('Este cupom promocional atingiu o limite de uso.');
      }
      const updated = await tx.promotionalCoupon.updateMany({
        where: { id: coupon.promotionalCouponId, usedCount: currentCoupon.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (updated.count === 0) throw new ConflictException('Este cupom promocional atingiu o limite de uso.');

      await tx.promotionalCouponUsage.create({
        data: {
          promotionalCouponId: coupon.promotionalCouponId,
          orderId: params.orderId,
          userId: params.userId,
          couponCode: coupon.couponCode,
          discountAmount: coupon.discountAmount,
        },
      });
    }

    if (coupon.couponType === CouponType.REFERRAL && coupon.referralOwnerUserId) {
      const referralDiscountConfig = this.getReferralDiscountConfig();
      await tx.referralUsage.create({
        data: {
          referralOwnerUserId: coupon.referralOwnerUserId,
          referredUserId: params.userId,
          orderId: params.orderId,
          referralCode: coupon.couponCode,
          status: ReferralUsageStatus.PENDING_CONFIRMATION,
          discountType: referralDiscountConfig.type,
          discountValue: referralDiscountConfig.value,
          maxDiscountAmount: referralDiscountConfig.maxDiscount,
          discountAmount: coupon.discountAmount,
        },
      });
    }

    if (coupon.couponType === CouponType.REFERRAL_REWARD && coupon.referralRewardId) {
      const changed = await tx.referralReward.updateMany({
        where: {
          id: coupon.referralRewardId,
          referralOwnerUserId: params.userId,
          status: ReferralRewardStatus.AVAILABLE,
          usedOrderId: null,
        },
        data: {
          status: ReferralRewardStatus.USED,
          usedOrderId: params.orderId,
          usedAt: new Date(),
          appliedDiscountAmount: coupon.discountAmount,
        },
      });

      if (changed.count === 0) {
        throw new ConflictException('Esta recompensa de indicação não está disponível para uso.');
      }
    }
  }

  async handleOrderStatusChange(orderId: string, newStatus: OrderStatus) {
    if (newStatus === OrderStatus.CANCELED) {
      await this.prisma.$transaction(async (tx) => {
        const usage = await tx.referralUsage.findUnique({
          where: { orderId },
          include: { reward: true },
        });

        if (!usage) return;

        if (usage.reward?.status === ReferralRewardStatus.USED) {
          return;
        }

        if (usage.reward && usage.reward.status !== ReferralRewardStatus.USED) {
          await tx.referralReward.delete({ where: { id: usage.reward.id } });
        }

        await tx.referralUsage.delete({ where: { id: usage.id } });
      });
      return;
    }

    if (newStatus !== OrderStatus.ACCEPTED) {
      return;
    }

    const referralUsage = await this.prisma.referralUsage.findUnique({
      where: { orderId },
    });

    if (!referralUsage || referralUsage.status === ReferralUsageStatus.CONFIRMED) {
      return;
    }

    const rewardEnabled = this.configService.get<string>('REFERRAL_REWARD_ENABLED', 'true') === 'true';

    await this.prisma.$transaction(async (tx) => {
      const usage = await tx.referralUsage.findUnique({ where: { orderId } });
      if (!usage || usage.status === ReferralUsageStatus.CONFIRMED) return;

      await tx.referralUsage.update({
        where: { id: usage.id },
        data: {
          status: ReferralUsageStatus.CONFIRMED,
          rewardGrantedAt: rewardEnabled ? new Date() : null,
        },
      });

      if (!rewardEnabled) return;

      const rewardConfig = this.getReferralRewardConfig();
      let createdReward = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          await tx.referralReward.create({
            data: {
              code: generateReferralRewardCode(),
              referralOwnerUserId: usage.referralOwnerUserId,
              referralUsageId: usage.id,
              discountType: rewardConfig.type,
              discountValue: rewardConfig.value,
              maxDiscountAmount: rewardConfig.maxDiscount,
              status: ReferralRewardStatus.AVAILABLE,
              grantedAt: new Date(),
            },
          });
          createdReward = true;
          break;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            Array.isArray(error.meta?.target) &&
            (error.meta?.target as string[]).includes('code')
          ) {
            continue;
          }
          throw error;
        }
      }

      if (!createdReward) {
        throw new ConflictException('Falha ao liberar recompensa de indicação.');
      }
    });
  }

  async createPromotionalCoupon(adminUserId: string, dto: CreatePromotionalCouponDto) {
    const code = normalizeCouponCode(dto.code);
    if (!isAlphanumericCouponCode(code)) {
      throw new BadRequestException('O código do cupom deve conter somente letras e números.');
    }

    this.ensureDateWindow(dto.startsAt, dto.endsAt);

    try {
      const createdCoupon = await this.prisma.promotionalCoupon.create({
        data: {
          code,
          discountType: DiscountType.PERCENT,
          discountValue: new Prisma.Decimal(dto.discountPercent),
          maxDiscountAmount:
            dto.maxDiscountAmount !== undefined
              ? new Prisma.Decimal(dto.maxDiscountAmount)
              : null,
          minOrderAmount: new Prisma.Decimal(dto.minOrderAmount),
          maxUses: dto.maxUses,
          isActive: dto.isActive ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          createdByAdminId: adminUserId,
        },
      });

      await this.ablyRealtimeService.publishPromotionalCouponCreated({
        id: createdCoupon.id,
        code: createdCoupon.code,
        discountType: createdCoupon.discountType,
        discountValue: Number(createdCoupon.discountValue),
        maxDiscountAmount: createdCoupon.maxDiscountAmount ? Number(createdCoupon.maxDiscountAmount) : null,
        minOrderAmount: Number(createdCoupon.minOrderAmount),
        maxUses: createdCoupon.maxUses,
        usedCount: createdCoupon.usedCount,
        remainingUses: Math.max(0, createdCoupon.maxUses - createdCoupon.usedCount),
        startsAt: createdCoupon.startsAt?.toISOString() ?? null,
        endsAt: createdCoupon.endsAt?.toISOString() ?? null,
      });

      void this.notifyUsersAboutNewPromotionalCoupon(createdCoupon).catch(() => undefined);

      return createdCoupon;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Já existe um cupom promocional com este código.');
      }
      throw error;
    }
  }

  async listPromotionalCoupons(query: ListPromotionalCouponsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.PromotionalCouponWhereInput = {
      ...(query.code ? { code: { contains: normalizeCouponCode(query.code) } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.expired === true ? { endsAt: { lt: now } } : {}),
      ...(query.expired === false ? { OR: [{ endsAt: null }, { endsAt: { gte: now } }] } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.promotionalCoupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.promotionalCoupon.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async listPublicPromotionalCoupons(query: ListPromotionalCouponsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.PromotionalCouponWhereInput = {
      isActive: true,
      ...(query.code ? { code: { contains: normalizeCouponCode(query.code) } } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.promotionalCoupon.findMany({
        where,
        orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.promotionalCoupon.count({ where }),
    ]);

    return {
      data: data.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
        maxUses: coupon.maxUses,
        usedCount: coupon.usedCount,
        remainingUses: Math.max(0, coupon.maxUses - coupon.usedCount),
        isActive: coupon.isActive,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
        createdAt: coupon.createdAt,
        updatedAt: coupon.updatedAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPromotionalCouponById(id: string) {
    const coupon = await this.prisma.promotionalCoupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Cupom promocional não encontrado');
    return coupon;
  }

  async updatePromotionalCoupon(id: string, dto: UpdatePromotionalCouponDto) {
    this.ensureDateWindow(dto.startsAt, dto.endsAt);

    try {
      return await this.prisma.promotionalCoupon.update({
        where: { id },
        data: {
          discountValue:
            dto.discountPercent !== undefined ? new Prisma.Decimal(dto.discountPercent) : undefined,
          maxDiscountAmount:
            dto.maxDiscountAmount !== undefined ? new Prisma.Decimal(dto.maxDiscountAmount) : undefined,
          minOrderAmount:
            dto.minOrderAmount !== undefined ? new Prisma.Decimal(dto.minOrderAmount) : undefined,
          maxUses: dto.maxUses,
          startsAt: dto.startsAt !== undefined ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt !== undefined ? new Date(dto.endsAt) : undefined,
          isActive: dto.isActive,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Cupom promocional não encontrado');
      }
      throw error;
    }
  }

  async deactivatePromotionalCoupon(id: string) {
    return this.updatePromotionalCoupon(id, { isActive: false });
  }

  async listPromotionalCouponUsages(id: string) {
    await this.getPromotionalCouponById(id);
    return this.prisma.promotionalCouponUsage.findMany({
      where: { promotionalCouponId: id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, total: true, status: true, createdAt: true } },
      },
      orderBy: { usedAt: 'desc' },
    });
  }

  async getMyReferralCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async getMyReferralRewards(userId: string) {
    const [rewards, summary] = await Promise.all([
      this.prisma.referralReward.findMany({
        where: { referralOwnerUserId: userId },
        include: {
          referralUsage: {
            select: {
              referredUser: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.referralReward.groupBy({
        by: ['status'],
        where: { referralOwnerUserId: userId },
        _count: { _all: true },
      }),
    ]);

    const summaryMap = summary.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return {
      summary: {
        pending: summaryMap[ReferralRewardStatus.PENDING] ?? 0,
        available: summaryMap[ReferralRewardStatus.AVAILABLE] ?? 0,
        used: summaryMap[ReferralRewardStatus.USED] ?? 0,
      },
      data: rewards,
    };
  }

  async getMyReferralHistory(userId: string) {
    const [asOwner, asReferred] = await Promise.all([
      this.prisma.referralUsage.findMany({
        where: { referralOwnerUserId: userId },
        include: {
          referredUser: { select: { id: true, name: true, email: true } },
          reward: { select: { id: true, code: true, status: true, grantedAt: true, usedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.referralUsage.findMany({
        where: { referredUserId: userId },
        include: {
          referralOwnerUser: { select: { id: true, name: true, email: true, referralCode: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { referredUsers: asOwner, usedReferrals: asReferred };
  }

  private async validateCouponCore(
    db: PrismaService | Prisma.TransactionClient,
    params: {
      userId: string;
      restaurantId: string;
      couponCode: string;
      subtotal: Prisma.Decimal;
      deliveryFee: Prisma.Decimal;
    },
  ): Promise<CouponValidationOutput> {
    const normalizedCode = normalizeCouponCode(params.couponCode);
    const totalBeforeDiscount = params.subtotal.plus(params.deliveryFee);
    const discountBase = params.subtotal;

    if (!isAlphanumericCouponCode(normalizedCode)) {
      return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom inválido.');
    }

    const [restaurant, promotionalCoupon, referralOwner, availableReward, userOrdersCount, referredUsage] =
      await Promise.all([
        db.restaurant.findUnique({
          where: { id: params.restaurantId },
          select: { id: true, acceptsPromotionalCoupons: true, acceptsReferralCoupons: true },
        }),
        db.promotionalCoupon.findUnique({ where: { code: normalizedCode } }),
        db.user.findUnique({ where: { referralCode: normalizedCode }, select: { id: true, referralCode: true } }),
        db.referralReward.findFirst({
          where: {
            code: normalizedCode,
            referralOwnerUserId: params.userId,
            status: ReferralRewardStatus.AVAILABLE,
            usedOrderId: null,
          },
        }),
        db.order.count({ where: { userId: params.userId } }),
        db.referralUsage.findUnique({ where: { referredUserId: params.userId } }),
      ]);

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    if (availableReward) {
      if (!restaurant.acceptsReferralCoupons) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Este restaurante não aceita este tipo de cupom');
      }
      const discount = this.computeDiscount(
        availableReward.discountType,
        availableReward.discountValue,
        availableReward.maxDiscountAmount,
        discountBase,
      );
      return this.valid({
        type: CouponType.REFERRAL_REWARD,
        couponCode: normalizedCode,
        discountAmount: discount,
        totalBeforeDiscount,
        discountType: availableReward.discountType,
        discountValue: availableReward.discountValue,
        maxDiscountAmount: availableReward.maxDiscountAmount,
        referralRewardId: availableReward.id,
      });
    }

    if (promotionalCoupon) {
      if (!restaurant.acceptsPromotionalCoupons) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Este restaurante não aceita este tipo de cupom');
      }
      const now = new Date();
      if (!promotionalCoupon.isActive) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom promocional inativo.');
      }
      if (promotionalCoupon.startsAt && promotionalCoupon.startsAt > now) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom ainda não está disponível para uso.');
      }
      if (promotionalCoupon.endsAt && promotionalCoupon.endsAt < now) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom promocional expirado.');
      }
      if (promotionalCoupon.usedCount >= promotionalCoupon.maxUses) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Este cupom promocional atingiu o limite de uso.');
      }
      if (params.subtotal.lessThan(promotionalCoupon.minOrderAmount)) {
        return this.invalid(
          normalizedCode,
          totalBeforeDiscount,
          `Pedido mínimo para este cupom é R$ ${promotionalCoupon.minOrderAmount.toString()}.`,
        );
      }

      const discount = this.computeDiscount(
        promotionalCoupon.discountType,
        promotionalCoupon.discountValue,
        promotionalCoupon.maxDiscountAmount,
        discountBase,
      );

      return this.valid({
        type: CouponType.PROMOTIONAL,
        couponCode: normalizedCode,
        discountAmount: discount,
        totalBeforeDiscount,
        minOrderAmount: promotionalCoupon.minOrderAmount,
        discountType: promotionalCoupon.discountType,
        discountValue: promotionalCoupon.discountValue,
        maxDiscountAmount: promotionalCoupon.maxDiscountAmount,
        promotionalCouponId: promotionalCoupon.id,
      });
    }

    if (referralOwner) {
      if (!restaurant.acceptsReferralCoupons) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Este restaurante não aceita este tipo de cupom');
      }
      if (referralOwner.id === params.userId) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Você não pode usar o seu próprio cupom de indicação.');
      }
      const referralEnabled = this.configService.get<string>('REFERRAL_COUPON_ENABLED', 'true') === 'true';
      if (!referralEnabled) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupons de indicação estão desativados no momento.');
      }
      const referralOnlyFirstOrder =
        this.configService.get<string>('REFERRAL_ONLY_FIRST_ORDER', 'true') === 'true';
      if (referralOnlyFirstOrder && userOrdersCount > 0) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom de indicação só pode ser usado no primeiro pedido.');
      }
      if (referredUsage) {
        return this.invalid(normalizedCode, totalBeforeDiscount, 'Você já utilizou um cupom de indicação anteriormente.');
      }

      const config = this.getReferralDiscountConfig();
      const discount = this.computeDiscount(config.type, config.value, config.maxDiscount, discountBase);

      return this.valid({
        type: CouponType.REFERRAL,
        couponCode: normalizedCode,
        discountAmount: discount,
        totalBeforeDiscount,
        discountType: config.type,
        discountValue: config.value,
        maxDiscountAmount: config.maxDiscount,
        referralOwnerUserId: referralOwner.id,
      });
    }

    return this.invalid(normalizedCode, totalBeforeDiscount, 'Cupom não encontrado.');
  }

  private valid(params: {
    type: CouponType;
    couponCode: string;
    discountAmount: Prisma.Decimal;
    totalBeforeDiscount: Prisma.Decimal;
    discountType: DiscountType;
    discountValue: Prisma.Decimal;
    maxDiscountAmount: Prisma.Decimal | null;
    minOrderAmount?: Prisma.Decimal | null;
    promotionalCouponId?: string;
    referralOwnerUserId?: string;
    referralRewardId?: string;
  }): CouponValidationResult {
    return {
      valid: true,
      type: params.type,
      couponCode: params.couponCode,
      message: 'Cupom válido.',
      discountAmount: params.discountAmount,
      discountPercent: params.discountType === DiscountType.PERCENT ? Number(params.discountValue) : null,
      maxDiscountAmount: params.maxDiscountAmount ? Number(params.maxDiscountAmount) : null,
      minOrderAmount: params.minOrderAmount ? Number(params.minOrderAmount) : null,
      finalTotalPreview: Prisma.Decimal.max(new Prisma.Decimal(0), params.totalBeforeDiscount.minus(params.discountAmount)),
      promotionalCouponId: params.promotionalCouponId,
      referralOwnerUserId: params.referralOwnerUserId,
      referralRewardId: params.referralRewardId,
      discountType: params.discountType,
      discountValue: params.discountValue,
    };
  }

  private invalid(couponCode: string, totalBeforeDiscount: Prisma.Decimal, message: string): CouponValidationOutput {
    return {
      valid: false,
      type: null,
      couponCode,
      message,
      discountAmount: new Prisma.Decimal(0),
      discountPercent: null,
      maxDiscountAmount: null,
      minOrderAmount: null,
      finalTotalPreview: totalBeforeDiscount,
    };
  }

  private computeDiscount(
    discountType: DiscountType,
    discountValue: Prisma.Decimal,
    maxDiscountAmount: Prisma.Decimal | null,
    baseTotal: Prisma.Decimal,
  ) {
    let calculated =
      discountType === DiscountType.PERCENT
        ? baseTotal.mul(discountValue).div(100)
        : discountValue;

    if (maxDiscountAmount && calculated.greaterThan(maxDiscountAmount)) {
      calculated = maxDiscountAmount;
    }

    if (calculated.greaterThan(baseTotal)) {
      calculated = baseTotal;
    }

    return calculated;
  }

  private getReferralDiscountConfig() {
    const type = this.configService.get<string>('REFERRAL_DISCOUNT_TYPE', 'PERCENT') as DiscountType;
    const value = new Prisma.Decimal(this.configService.get<string>('REFERRAL_DISCOUNT_VALUE', '15'));
    const maxDiscountValue = this.configService.get<string>('REFERRAL_MAX_DISCOUNT', '999999');
    return {
      type,
      value,
      maxDiscount: maxDiscountValue ? new Prisma.Decimal(maxDiscountValue) : null,
    };
  }

  private getReferralRewardConfig() {
    const type = this.configService.get<string>('REFERRAL_REWARD_TYPE', 'PERCENT') as DiscountType;
    const value = new Prisma.Decimal(this.configService.get<string>('REFERRAL_REWARD_VALUE', '15'));
    const maxDiscountValue = this.configService.get<string>('REFERRAL_REWARD_MAX_DISCOUNT', '999999');
    return {
      type,
      value,
      maxDiscount: maxDiscountValue ? new Prisma.Decimal(maxDiscountValue) : null,
    };
  }


  private async notifyUsersAboutNewPromotionalCoupon(coupon: {
    id: string;
    code: string;
    discountValue: Prisma.Decimal;
    maxDiscountAmount: Prisma.Decimal | null;
    minOrderAmount: Prisma.Decimal;
    endsAt: Date | null;
  }) {
    const users = await this.prisma.user.findMany({
      where: {
        role: Role.USER,
        isActive: true,
        deletedAt: null,
        expoPushToken: { not: null },
      },
      select: {
        id: true,
        expoPushToken: true,
      },
    });

    if (!users.length) return;

    const title = 'Novo cupom disponível';
    const maxDiscountText = coupon.maxDiscountAmount
      ? ` • até R$ ${Number(coupon.maxDiscountAmount).toFixed(2).replace('.', ',')}`
      : '';
    const minOrderText = Number(coupon.minOrderAmount) > 0
      ? ` • pedido mínimo R$ ${Number(coupon.minOrderAmount).toFixed(2).replace('.', ',')}`
      : '';
    const endsAtText = coupon.endsAt
      ? ` • válido até ${coupon.endsAt.toLocaleDateString('pt-BR')}`
      : '';
    const body = `Use ${coupon.code} e ganhe ${Number(coupon.discountValue).toFixed(0)}% de desconto${maxDiscountText}${minOrderText}${endsAtText}`;

    await Promise.allSettled(
      users.map((user) =>
        this.pushNotificationsService.sendToExpoPushToken(String(user.expoPushToken || ''), {
          title,
          body,
          data: {
            type: 'NEW_PROMOTIONAL_COUPON',
            couponId: coupon.id,
            couponCode: coupon.code,
          },
        }),
      ),
    );
  }

  private ensureDateWindow(startsAt?: string, endsAt?: string) {
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      throw new BadRequestException('startsAt deve ser menor que endsAt.');
    }
  }

  private serializeValidationResult(result: CouponValidationOutput) {
    return {
      ...result,
      discountAmount: Number(result.discountAmount),
      finalTotalPreview: Number(result.finalTotalPreview),
    };
  }
}
