import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { ReplaceOpeningHoursDto } from './dto/replace-opening-hours.dto';
import { RedisCacheService } from '../cache/cache.service';
import { CacheKeys, getRestaurantMenuCacheKeys } from '../cache/cache.keys';
import { UpsertRestaurantReviewDto } from './dto/upsert-restaurant-review.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async create(dto: CreateRestaurantDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.ownerId },
    });

    if (!owner) {
      throw new NotFoundException('Usuário dono do restaurante não encontrado');
    }

    if (owner.role !== Role.RESTAURANT && owner.role !== Role.ADMIN) {
      throw new BadRequestException(
        'O ownerId informado precisa ser um usuário com role RESTAURANT ou ADMIN',
      );
    }

    if (dto.cityId) {
      await this.ensureCityExists(dto.cityId);
    }

    const restaurant = await this.prisma.restaurant.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        logoUrl: dto.logoUrl?.trim(),
        bannerUrl: dto.bannerUrl?.trim(),
        phone: dto.phone?.trim(),
        address: dto.address.trim(),
        ownerId: dto.ownerId,
        cityId: dto.cityId,
        minOrder:
          dto.minOrder !== undefined ? new Prisma.Decimal(dto.minOrder) : undefined,
        acceptsReferralCoupons: dto.acceptsReferralCoupons,
        acceptsPromotionalCoupons: dto.acceptsPromotionalCoupons,
      },
      include: this.restaurantInclude(),
    });

    const serialized = this.serializeRestaurant(restaurant);
    await this.invalidateRestaurantPublicCache(restaurant.id);
    return serialized;
  }

  async findAll() {
    return this.cache.getOrSet(
      CacheKeys.restaurantsAll,
      this.cache.getTtlSeconds('CACHE_TTL_RESTAURANTS', 60),
      async () => {
        const restaurants = await this.prisma.restaurant.findMany({
          orderBy: {
            createdAt: 'desc',
          },
          include: this.restaurantInclude(),
        });

        return restaurants.map((restaurant) => this.serializeRestaurant(restaurant));
      },
    );
  }

  async findActive() {
    return this.cache.getOrSet(
      CacheKeys.restaurantsActive,
      this.cache.getTtlSeconds('CACHE_TTL_RESTAURANTS', 60),
      async () => {
        const restaurants = await this.prisma.restaurant.findMany({
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: this.restaurantInclude(false),
        });

        return restaurants.map((restaurant) => this.serializeRestaurant(restaurant));
      },
    );
  }

  async findOwnedByUser(userId: string) {
    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        hours: { orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }] },
        city: { include: { state: true } },
        menuCategories: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        storeCategories: {
          include: {
            storeCategory: {
              select: { id: true, name: true, iconUrl: true, sortOrder: true },
            },
          },
          orderBy: { storeCategory: { sortOrder: 'asc' } },
        },
      },
    });

    return restaurants.map((restaurant) => this.serializeRestaurant(restaurant));
  }

  async findAvailableByAddress(addressId: string, userId: string) {
    const address = await this.prisma.userAddress.findFirst({
      where: {
        id: addressId,
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

    const restaurants = await this.prisma.restaurant.findMany({
      where: {
        isActive: true,
        cityId: address.cityId,
        deliveryZones: {
          some: {
            neighborhoodId: address.neighborhoodId,
            isActive: true,
          },
        },
      },
      include: {
        ...this.restaurantInclude(false),
        favorites: {
          where: { userId },
          select: { id: true },
        },
        deliveryZones: {
          where: {
            neighborhoodId: address.neighborhoodId,
            isActive: true,
          },
          include: {
            neighborhood: {
              include: {
                city: {
                  include: {
                    state: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return restaurants.map((restaurant) => this.serializeRestaurant(restaurant));
  }

  async findFavoriteRestaurants(userId: string) {
    const favorites = await this.prisma.restaurantFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        restaurant: {
          include: {
            ...this.restaurantInclude(false),
            favorites: {
              where: { userId },
              select: { id: true },
            },
          },
        },
      },
    });

    return favorites.map((entry) => ({
      favoritedAt: entry.createdAt,
      restaurant: this.serializeRestaurant(entry.restaurant),
    }));
  }

  async favoriteRestaurant(restaurantId: string, userId: string) {
    await this.ensureRestaurantPubliclyAvailable(restaurantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantFavorite.upsert({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
        create: {
          userId,
          restaurantId,
        },
        update: {},
      });

      await this.refreshRestaurantFavoriteCount(restaurantId, tx);
    });

    await this.invalidateRestaurantPublicCache(restaurantId);

    return {
      ok: true,
      isFavorite: true,
      restaurantId,
    };
  }

  async unfavoriteRestaurant(restaurantId: string, userId: string) {
    await this.ensureRestaurantPubliclyAvailable(restaurantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantFavorite.deleteMany({
        where: {
          userId,
          restaurantId,
        },
      });

      await this.refreshRestaurantFavoriteCount(restaurantId, tx);
    });

    await this.invalidateRestaurantPublicCache(restaurantId);

    return {
      ok: true,
      isFavorite: false,
      restaurantId,
    };
  }

  async listRestaurantReviews(restaurantId: string, page = 1, limit = 20) {
    await this.ensureRestaurantPubliclyAvailable(restaurantId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [data, total, restaurant] = await Promise.all([
      this.prisma.restaurantReview.findMany({
        where: { restaurantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: safeLimit,
      }),
      this.prisma.restaurantReview.count({ where: { restaurantId } }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          averageRating: true,
          ratingCount: true,
        },
      }),
    ]);

    return {
      restaurantId,
      summary: {
        averageRating: Number(restaurant?.averageRating ?? 0),
        ratingCount: restaurant?.ratingCount ?? 0,
      },
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getMyRestaurantReview(restaurantId: string, userId: string) {
    await this.ensureRestaurantPubliclyAvailable(restaurantId);
    return this.prisma.restaurantReview.findUnique({
      where: {
        userId_restaurantId: {
          userId,
          restaurantId,
        },
      },
    });
  }

  async upsertRestaurantReview(
    restaurantId: string,
    userId: string,
    dto: UpsertRestaurantReviewDto,
  ) {
    await this.ensureRestaurantPubliclyAvailable(restaurantId);

    const deliveredOrdersCount = await this.prisma.order.count({
      where: {
        userId,
        restaurantId,
        status: OrderStatus.DELIVERED,
      },
    });

    if (deliveredOrdersCount <= 0) {
      throw new BadRequestException(
        'Você só pode avaliar restaurantes após receber pelo menos um pedido.',
      );
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.restaurantReview.upsert({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
        create: {
          userId,
          restaurantId,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
        },
        update: {
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
        },
      });

      await this.refreshRestaurantRatingStats(restaurantId, tx);
      return saved;
    });

    await this.invalidateRestaurantPublicCache(restaurantId);
    return review;
  }

  async findOne(id: string) {
    return this.cache.getOrSet(
      CacheKeys.restaurantDetail(id),
      this.cache.getTtlSeconds('CACHE_TTL_RESTAURANT_DETAIL', 90),
      async () => {
        const restaurant = await this.prisma.restaurant.findUnique({
          where: { id },
          include: {
            ...this.restaurantInclude(),
            deliveryZones: {
              include: {
                neighborhood: {
                  include: {
                    city: {
                      include: {
                        state: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                neighborhood: {
                  name: 'asc',
                },
              },
            },
          },
        });

        if (!restaurant) {
          throw new NotFoundException('Restaurante não encontrado');
        }

        return this.serializeRestaurant(restaurant);
      },
    );
  }

  async update(
    id: string,
    dto: UpdateRestaurantDto,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantExists(id);

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);
    this.ensureAdminForcedStatusCanBeChanged(restaurant, dto.isActive, currentUser);

    if (dto.cityId) {
      await this.ensureCityExists(dto.cityId);
    }

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        logoUrl: dto.logoUrl?.trim(),
        bannerUrl: dto.bannerUrl?.trim(),
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
        cityId: dto.cityId,
        minOrder:
          dto.minOrder !== undefined ? new Prisma.Decimal(dto.minOrder) : undefined,
        isActive: dto.isActive,
        acceptsReferralCoupons: dto.acceptsReferralCoupons,
        acceptsPromotionalCoupons: dto.acceptsPromotionalCoupons,
      },
      include: this.restaurantInclude(),
    });

    const serialized = this.serializeRestaurant(updated);
    await this.invalidateRestaurantPublicCache(id);
    return serialized;
  }

  async updateStatus(
    id: string,
    isActive: boolean,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantExists(id);

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);
    this.ensureAdminForcedStatusCanBeChanged(restaurant, isActive, currentUser);

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data:
        currentUser.role === Role.ADMIN
          ? {
              isActive,
              adminDisabledAt: isActive ? null : new Date(),
              adminDisabledByUserId: isActive ? null : currentUser.userId,
            }
          : {
              isActive,
            },
      select: {
        id: true,
        name: true,
        isActive: true,
        adminDisabledAt: true,
        adminDisabledByUserId: true,
        updatedAt: true,
      },
    });

    await this.invalidateRestaurantPublicCache(id);
    return {
      ...updated,
      adminDisabled: Boolean(updated.adminDisabledAt),
    };
  }

  private restaurantInclude(includeOwnerContact = true): Prisma.RestaurantInclude {
    return {
      owner: {
        select: {
          id: true,
          name: true,
          ...(includeOwnerContact ? { email: true, phone: true } : { phone: true }),
          role: true,
        },
      },
      city: {
        include: {
          state: true,
        },
      },
      hours: {
        orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
      },
      menuCategories: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
        },
      },
      storeCategories: {
        include: {
          storeCategory: {
            select: {
              id: true,
              name: true,
              iconUrl: true,
              sortOrder: true,
            },
          },
        },
        orderBy: {
          storeCategory: { sortOrder: 'asc' },
        },
      },
    };
  }

  private serializeRestaurant<T extends Record<string, any>>(restaurant: T) {
    const openingStatus = this.getRestaurantOpeningStatus(restaurant.hours || []);
    const storeCategories = (restaurant.storeCategories || []).map(
      (entry: any) => entry.storeCategory,
    );
    const categoryNames = storeCategories.map((cat: any) => cat.name);

    return {
      ...restaurant,
      storeCategories,
      categoryNames,
      isFavorite: Array.isArray((restaurant as any).favorites)
        ? (restaurant as any).favorites.length > 0
        : undefined,
      favoritesCount: Number((restaurant as any).favoritesCount ?? 0),
      ratingCount: Number((restaurant as any).ratingCount ?? 0),
      averageRating: Number((restaurant as any).averageRating ?? 0),
      adminDisabled: Boolean((restaurant as any).adminDisabledAt),
      adminDisabledMessage: (restaurant as any).adminDisabledAt
        ? 'Administrador desativou este restaurante.'
        : null,
      isOpenNow: restaurant.isActive === false ? false : openingStatus.isOpen,
      acceptsOrdersNow: restaurant.isActive === false ? false : openingStatus.isOpen,
      openingStatusLabel:
        restaurant.isActive === false ? 'Inativo' : openingStatus.statusLabel,
      openingTodayLabel: openingStatus.todayLabel,
    };
  }

  private getRestaurantOpeningStatus(
    hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>,
  ) {
    const normalized = (hours || [])
      .map((item) => ({
        dayOfWeek: Number(item.dayOfWeek),
        openTime: String(item.openTime || '').slice(0, 5),
        closeTime: String(item.closeTime || '').slice(0, 5),
      }))
      .filter(
        (item) => Number.isInteger(item.dayOfWeek) && item.openTime && item.closeTime,
      )
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek || a.openTime.localeCompare(b.openTime),
      );

    if (!normalized.length) {
      return {
        isOpen: true,
        statusLabel: 'Horário não informado',
        todayLabel: 'Horário não informado',
      };
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const todayHours = normalized.filter((item) => item.dayOfWeek === dayOfWeek);

    if (!todayHours.length) {
      return {
        isOpen: false,
        statusLabel: 'Fechado hoje',
        todayLabel: 'Hoje: fechado',
      };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const slot of todayHours) {
      const openMinutes = this.timeToMinutes(slot.openTime);
      const closeMinutes = this.timeToMinutes(slot.closeTime);

      if (openMinutes === null || closeMinutes === null) {
        continue;
      }

      const isOpen =
        closeMinutes >= openMinutes
          ? currentMinutes >= openMinutes && currentMinutes < closeMinutes
          : currentMinutes >= openMinutes || currentMinutes < closeMinutes;

      if (isOpen) {
        return {
          isOpen: true,
          statusLabel: `Aberto até ${slot.closeTime}`,
          todayLabel: `Hoje: ${slot.openTime} às ${slot.closeTime}`,
        };
      }
    }

    const firstSlot = todayHours[0];
    return {
      isOpen: false,
      statusLabel: `Fechado agora • Hoje ${firstSlot.openTime} às ${firstSlot.closeTime}`,
      todayLabel: `Hoje: ${firstSlot.openTime} às ${firstSlot.closeTime}`,
    };
  }

  private timeToMinutes(value: string) {
    const [hour, minute] = String(value || '').split(':').map(Number);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }

    return hour * 60 + minute;
  }

  private async ensureRestaurantExists(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        adminDisabledAt: true,
        adminDisabledByUserId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    return restaurant;
  }

  private async ensureRestaurantPubliclyAvailable(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    return restaurant;
  }

  private async ensureCityExists(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
    });

    if (!city) {
      throw new NotFoundException('Cidade não encontrada');
    }
  }

  private ensureCanManageRestaurant(
    ownerId: string,
    currentUser: CurrentUserData,
  ) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = ownerId === currentUser.userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar este restaurante',
      );
    }
  }

  private ensureAdminForcedStatusCanBeChanged(
    restaurant: { adminDisabledAt: Date | null },
    nextIsActive: boolean | undefined,
    currentUser: CurrentUserData,
  ) {
    if (
      nextIsActive === true &&
      currentUser.role !== Role.ADMIN &&
      restaurant.adminDisabledAt
    ) {
      throw new ForbiddenException('Administrador desativou este restaurante.');
    }
  }

  async findOpeningHours(id: string) {
    await this.findOne(id);
    return this.prisma.openingHour.findMany({
      where: { restaurantId: id },
      orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
    });
  }

  async replaceOpeningHours(id: string, dto: ReplaceOpeningHoursDto) {
    const restaurant = await this.ensureRestaurantExists(id);
    const hours = (dto.hours || []).map((item) => ({
      restaurantId: id,
      dayOfWeek: item.dayOfWeek,
      openTime: item.openTime,
      closeTime: item.closeTime,
    }));

    const operations: Prisma.PrismaPromise<any>[] = [
      this.prisma.openingHour.deleteMany({ where: { restaurantId: id } }),
    ];

    if (hours.length) {
      operations.push(this.prisma.openingHour.createMany({ data: hours }));
    }

    await this.prisma.$transaction(operations);

    const updatedHours = await this.findOpeningHours(id);
    await this.invalidateRestaurantPublicCache(id);

    return {
      restaurantId: restaurant.id,
      hours: updatedHours,
      ...this.getRestaurantOpeningStatus(updatedHours),
    };
  }

  private async refreshRestaurantFavoriteCount(
    restaurantId: string,
    tx: PrismaService | Prisma.TransactionClient,
  ) {
    const count = await tx.restaurantFavorite.count({ where: { restaurantId } });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { favoritesCount: count },
    });
  }

  private async refreshRestaurantRatingStats(
    restaurantId: string,
    tx: PrismaService | Prisma.TransactionClient,
  ) {
    const aggregate = await tx.restaurantReview.aggregate({
      where: { restaurantId },
      _count: { _all: true },
      _avg: { rating: true },
    });

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        ratingCount: aggregate._count._all,
        averageRating: new Prisma.Decimal(
          Number(aggregate._avg.rating ?? 0).toFixed(2),
        ),
      },
    });
  }

  private async invalidateRestaurantPublicCache(restaurantId: string) {
    await this.cache.delMany([
      CacheKeys.restaurantsAll,
      CacheKeys.restaurantsActive,
      CacheKeys.restaurantDetail(restaurantId),
      CacheKeys.publicDeliveryZones(restaurantId),
      ...getRestaurantMenuCacheKeys(restaurantId),
    ]);
  }
}
