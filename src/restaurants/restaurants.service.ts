import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/interfaces/current-user.interface';
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

    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        address: dto.address,
        ownerId: dto.ownerId,
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
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    return restaurant;
  }

  async update(id: string, dto: UpdateRestaurantDto, currentUser: CurrentUserData) {
    const restaurant = await this.ensureRestaurantExists(id);

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    return this.prisma.restaurant.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        phone: dto.phone,
        address: dto.address,
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
      },
    });
  }

  async updateStatus(id: string, isActive: boolean, currentUser: CurrentUserData) {
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

  private ensureCanManageRestaurant(ownerId: string, currentUser: CurrentUserData) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = ownerId === currentUser.userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar este restaurante',
      );
    }
  }
}