import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateRestaurantDeliveryZoneDto } from './dto/create-restaurant-delivery-zone.dto';
import { UpdateRestaurantDeliveryZoneDto } from './dto/update-restaurant-delivery-zone.dto';
import { RedisCacheService } from '../cache/cache.service';
import { CacheKeys, getRestaurantMenuCacheKeys } from '../cache/cache.keys';

@Injectable()
export class RestaurantDeliveryZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async create(
    dto: CreateRestaurantDeliveryZoneDto,
    currentUser: CurrentUserData,
  ) {
    this.ensureMinTimeIsValid(dto.minTime, dto.maxTime);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: {
        id: true,
        ownerId: true,
        cityId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    if (!restaurant.cityId) {
      throw new BadRequestException(
        'O restaurante precisa ter uma cidade definida antes de configurar bairros de entrega',
      );
    }

    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: dto.neighborhoodId },
      include: {
        city: true,
      },
    });

    if (!neighborhood) {
      throw new NotFoundException('Bairro não encontrado');
    }

    if (neighborhood.cityId !== restaurant.cityId) {
      throw new BadRequestException(
        'O bairro informado não pertence à mesma cidade do restaurante',
      );
    }

    const existingZone = await this.prisma.restaurantDeliveryZone.findFirst({
      where: {
        restaurantId: dto.restaurantId,
        neighborhoodId: dto.neighborhoodId,
      },
    });

    if (existingZone) {
      throw new BadRequestException(
        'Este restaurante já possui configuração para esse bairro',
      );
    }

    const created = await this.prisma.restaurantDeliveryZone.create({
      data: {
        restaurantId: dto.restaurantId,
        neighborhoodId: dto.neighborhoodId,
        deliveryFee: new Prisma.Decimal(dto.deliveryFee),
        minTime: dto.minTime,
        maxTime: dto.maxTime,
        isActive: dto.isActive ?? true,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
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
    });

    await this.invalidateRestaurantDeliveryCache(dto.restaurantId);
    return created;
  }

  async findByRestaurant(
    restaurantId: string,
    currentUser?: CurrentUserData,
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

    if (currentUser && currentUser.role !== Role.ADMIN) {
      const isOwner = restaurant.ownerId === currentUser.userId;
      if (!isOwner) {
        throw new ForbiddenException(
          'Você não tem permissão para acessar as zonas deste restaurante',
        );
      }
    }

    return this.prisma.restaurantDeliveryZone.findMany({
      where: {
        restaurantId,
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
      orderBy: [
        {
          isActive: 'desc',
        },
        {
          neighborhood: {
            name: 'asc',
          },
        },
      ],
    });
  }

  async findPublicByRestaurant(restaurantId: string) {
    return this.cache.getOrSet(
      CacheKeys.publicDeliveryZones(restaurantId),
      this.cache.getTtlSeconds('CACHE_TTL_DELIVERY_ZONES', 300),
      async () => {
        const restaurant = await this.prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: {
            id: true,
            isActive: true,
          },
        });

        if (!restaurant) {
          throw new NotFoundException('Restaurante não encontrado');
        }

        if (!restaurant.isActive) {
          return [];
        }

        return this.prisma.restaurantDeliveryZone.findMany({
          where: {
            restaurantId,
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
          orderBy: {
            neighborhood: {
              name: 'asc',
            },
          },
        });
      },
    );
  }

  async findOne(id: string, currentUser: CurrentUserData) {
    const zone = await this.prisma.restaurantDeliveryZone.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
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
    });

    if (!zone) {
      throw new NotFoundException('Zona de entrega não encontrada');
    }

    this.ensureCanManageRestaurant(zone.restaurant.ownerId, currentUser);

    return zone;
  }

  async update(
    id: string,
    dto: UpdateRestaurantDeliveryZoneDto,
    currentUser: CurrentUserData,
  ) {
    const zone = await this.prisma.restaurantDeliveryZone.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            ownerId: true,
            cityId: true,
          },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException('Zona de entrega não encontrada');
    }

    this.ensureCanManageRestaurant(zone.restaurant.ownerId, currentUser);

    const nextMinTime = dto.minTime ?? zone.minTime;
    const nextMaxTime = dto.maxTime ?? zone.maxTime;

    this.ensureMinTimeIsValid(nextMinTime, nextMaxTime);

    if (dto.neighborhoodId) {
      const neighborhood = await this.prisma.neighborhood.findUnique({
        where: { id: dto.neighborhoodId },
      });

      if (!neighborhood) {
        throw new NotFoundException('Bairro não encontrado');
      }

      if (zone.restaurant.cityId && neighborhood.cityId !== zone.restaurant.cityId) {
        throw new BadRequestException(
          'O bairro informado não pertence à mesma cidade do restaurante',
        );
      }

      const duplicatedZone = await this.prisma.restaurantDeliveryZone.findFirst({
        where: {
          restaurantId: zone.restaurant.id,
          neighborhoodId: dto.neighborhoodId,
          NOT: {
            id,
          },
        },
      });

      if (duplicatedZone) {
        throw new BadRequestException(
          'Este restaurante já possui configuração para esse bairro',
        );
      }
    }

    const updated = await this.prisma.restaurantDeliveryZone.update({
      where: { id },
      data: {
        neighborhoodId: dto.neighborhoodId,
        deliveryFee:
          dto.deliveryFee !== undefined
            ? new Prisma.Decimal(dto.deliveryFee)
            : undefined,
        minTime: dto.minTime,
        maxTime: dto.maxTime,
        isActive: dto.isActive,
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
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
    });

    await this.invalidateRestaurantDeliveryCache(zone.restaurant.id);
    return updated;
  }

  async updateStatus(
    id: string,
    isActive: boolean,
    currentUser: CurrentUserData,
  ) {
    const zone = await this.prisma.restaurantDeliveryZone.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException('Zona de entrega não encontrada');
    }

    this.ensureCanManageRestaurant(zone.restaurant.ownerId, currentUser);

    const updated = await this.prisma.restaurantDeliveryZone.update({
      where: { id },
      data: {
        isActive,
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
    });

    await this.invalidateRestaurantDeliveryCache(zone.restaurantId);
    return updated;
  }

  async remove(id: string, currentUser: CurrentUserData) {
    const zone = await this.prisma.restaurantDeliveryZone.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!zone) {
      throw new NotFoundException('Zona de entrega não encontrada');
    }

    this.ensureCanManageRestaurant(zone.restaurant.ownerId, currentUser);

    await this.prisma.restaurantDeliveryZone.delete({
      where: { id },
    });

    await this.invalidateRestaurantDeliveryCache(zone.restaurantId);
    return {
      message: 'Zona de entrega removida com sucesso',
    };
  }

  private async invalidateRestaurantDeliveryCache(restaurantId: string) {
    await this.cache.delMany([
      CacheKeys.restaurantDetail(restaurantId),
      CacheKeys.publicDeliveryZones(restaurantId),
      ...getRestaurantMenuCacheKeys(restaurantId),
    ]);

  }

  private ensureCanManageRestaurant(
    ownerId: string,
    currentUser: CurrentUserData,
  ) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = ownerId === currentUser.userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar as zonas de entrega deste restaurante',
      );
    }
  }

  private ensureMinTimeIsValid(minTime: number, maxTime: number) {
    if (minTime > maxTime) {
      throw new BadRequestException(
        'O tempo mínimo não pode ser maior que o tempo máximo',
      );
    }
  }
}