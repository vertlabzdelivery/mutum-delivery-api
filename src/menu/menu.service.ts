import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMenuItemDto, currentUser: CurrentUserData) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    return this.prisma.menuItem.create({
      data: {
        restaurantId: dto.restaurantId,
        name: dto.name,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        imageUrl: dto.imageUrl,
        isAvailable: dto.isAvailable ?? true,
      },
    });
  }

  async findByRestaurant(restaurantId: string, onlyAvailable?: boolean) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

    return this.prisma.menuItem.findMany({
      where: {
        restaurantId,
        ...(onlyAvailable === true ? { isAvailable: true } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            isActive: true,
            ownerId: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item do cardápio não encontrado');
    }

    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto, currentUser: CurrentUserData) {
    const item = await this.ensureItemExists(id);

    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    return this.prisma.menuItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price:
          dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        imageUrl: dto.imageUrl,
        isAvailable: dto.isAvailable,
      },
    });
  }

  async updateStatus(id: string, isAvailable: boolean, currentUser: CurrentUserData) {
    const item = await this.ensureItemExists(id);

    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    return this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable },
      select: {
        id: true,
        name: true,
        isAvailable: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, currentUser: CurrentUserData) {
    const item = await this.ensureItemExists(id);

    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    await this.prisma.menuItem.delete({
      where: { id },
    });

    return {
      message: 'Item removido com sucesso',
    };
  }

  private async ensureItemExists(id: string) {
    const item = await this.prisma.menuItem.findUnique({
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

    if (!item) {
      throw new NotFoundException('Item do cardápio não encontrado');
    }

    return item;
  }

  private ensureCanManageRestaurant(ownerId: string, currentUser: CurrentUserData) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const isOwner = ownerId === currentUser.userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar este cardápio',
      );
    }
  }
}