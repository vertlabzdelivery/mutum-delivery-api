import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMenuItemDto) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado');
    }

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
        ...(onlyAvailable ? { isAvailable: true } : {}),
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
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item do cardápio não encontrado');
    }

    return item;
  }

  async update(id: string, dto: UpdateMenuItemDto) {
    await this.ensureItemExists(id);

    return this.prisma.menuItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
        imageUrl: dto.imageUrl,
        isAvailable: dto.isAvailable,
      },
    });
  }

  async updateStatus(id: string, isAvailable: boolean) {
    await this.ensureItemExists(id);

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

  async remove(id: string) {
    await this.ensureItemExists(id);

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
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('Item do cardápio não encontrado');
    }
  }
}