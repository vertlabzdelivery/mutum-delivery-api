import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.restaurant.create({
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
          dto.minOrder !== undefined
            ? new Prisma.Decimal(dto.minOrder)
            : undefined,
      },
      include: this.restaurantInclude(),
    });
  }

  async findAll() {
    return this.prisma.restaurant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: this.restaurantInclude(),
    });
  }

  async findActive() {
    return this.prisma.restaurant.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: this.restaurantInclude(false),
    });
  }

  async findOwnedByUser(userId: string) {
    return this.prisma.restaurant.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        city: {
          include: {
            state: true,
          },
        },
        menuCategories: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
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

    return this.prisma.restaurant.findMany({
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
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

    return restaurant;
  }

  async update(
    id: string,
    dto: UpdateRestaurantDto,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantExists(id);

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    if (dto.cityId) {
      await this.ensureCityExists(dto.cityId);
    }

    return this.prisma.restaurant.update({
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
          dto.minOrder !== undefined
            ? new Prisma.Decimal(dto.minOrder)
            : undefined,
        isActive: dto.isActive,
      },
      include: this.restaurantInclude(),
    });
  }

  async updateStatus(
    id: string,
    isActive: boolean,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantExists(id);

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    return this.prisma.restaurant.update({
      where: { id },
      data: {
        isActive,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  private restaurantInclude(
    includeOwnerContact = true,
  ): Prisma.RestaurantInclude {
    return {
      owner: {
        select: includeOwnerContact
          ? {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            }
          : {
              id: true,
              name: true,
              phone: true,
              role: true,
            },
      },
      city: {
        include: {
          state: true,
        },
      },
      menuCategories: {
        where: {
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
        },
      },
    };
  }

  private async ensureRestaurantExists(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
      },
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
}