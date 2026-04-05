import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateStoreCategoryDto } from './dto/create-store-category.dto';
import { UpdateStoreCategoryDto } from './dto/update-store-category.dto';
import { SetRestaurantStoreCategoriesDto } from './dto/set-restaurant-store-categories.dto';

@Injectable()
export class StoreCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(activeOnly = false) {
    return this.prisma.storeCategory.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.storeCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoria de loja não encontrada.');
    return category;
  }

  async create(dto: CreateStoreCategoryDto) {
    const existing = await this.prisma.storeCategory.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException(`Categoria "${dto.name}" já existe.`);
    }

    return this.prisma.storeCategory.create({
      data: {
        name: dto.name.trim(),
        iconUrl: dto.iconUrl?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateStoreCategoryDto) {
    await this.findOne(id);

    if (dto.name) {
      const conflict = await this.prisma.storeCategory.findFirst({
        where: { name: dto.name.trim(), id: { not: id } },
      });
      if (conflict) throw new ConflictException(`Categoria "${dto.name}" já existe.`);
    }

    return this.prisma.storeCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        iconUrl: dto.iconUrl?.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.restaurantStoreCategory.deleteMany({
      where: { storeCategoryId: id },
    });

    await this.prisma.storeCategory.delete({ where: { id } });
    return { message: 'Categoria removida com sucesso.' };
  }

  async findRestaurantCategories(restaurantId: string) {
    return this.prisma.storeCategory.findMany({
      where: {
        restaurants: { some: { restaurantId } },
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async setRestaurantCategories(
    restaurantId: string,
    dto: SetRestaurantStoreCategoriesDto,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, ownerId: true },
    });

    if (!restaurant) throw new NotFoundException('Restaurante não encontrado.');

    if (
      currentUser.role !== Role.ADMIN &&
      restaurant.ownerId !== currentUser.userId
    ) {
      throw new ForbiddenException('Sem permissão para alterar categorias deste restaurante.');
    }

    const categoryIds = dto.categoryIds ?? [];

    if (categoryIds.length > 0) {
      const found = await this.prisma.storeCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true },
      });
      if (found.length !== categoryIds.length) {
        throw new NotFoundException('Uma ou mais categorias não foram encontradas.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.restaurantStoreCategory.deleteMany({ where: { restaurantId } }),
      ...(categoryIds.length > 0
        ? [
            this.prisma.restaurantStoreCategory.createMany({
              data: categoryIds.map((storeCategoryId) => ({ restaurantId, storeCategoryId })),
            }),
          ]
        : []),
    ]);

    return this.findRestaurantCategories(restaurantId);
  }
}
