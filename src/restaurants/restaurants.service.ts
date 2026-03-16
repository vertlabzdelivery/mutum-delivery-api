import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
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
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        address: dto.address,
        ownerId: dto.ownerId,
        cityId: dto.cityId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        city: {
          include: {
            state: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.restaurant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        city: {
          include: {
            state: true,
          },
        },
      },
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
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        city: {
          include: {
            state: true,
          },
        },
      },
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
        owner: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        city: {
          include: {
            state: true,
          },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        city: {
          include: {
            state: true,
          },
        },
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
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        address: dto.address,
        cityId: dto.cityId,
        isActive: dto.isActive,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        city: {
          include: {
            state: true,
          },
        },
      },
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