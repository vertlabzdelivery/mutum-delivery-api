import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/interfaces/current-user.interface';
import {
  CreateMenuItemChoiceDto,
  CreateMenuItemDto,
  CreateMenuItemOptionDto,
} from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { RedisCacheService } from '../cache/cache.service';
import { CacheKeys, getRestaurantMenuCacheKeys } from '../cache/cache.keys';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async createCategory(
    dto: CreateMenuCategoryDto,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantExists(dto.restaurantId);
    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    const created = await this.prisma.menuCategory.create({
      data: {
        restaurantId: dto.restaurantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.imageUrl?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        menuItems: true,
      },
    });

    await this.invalidateRestaurantMenuCache(dto.restaurantId);
    return created;
  }

  async findCategoriesByRestaurant(
    restaurantId: string,
    activeOnly?: boolean,
  ) {
    await this.ensureRestaurantExists(restaurantId);

    return this.cache.getOrSet(
      CacheKeys.menuCategories(restaurantId, activeOnly),
      this.cache.getTtlSeconds('CACHE_TTL_MENU', 60),
      async () =>
        this.prisma.menuCategory.findMany({
          where: {
            restaurantId,
            ...(activeOnly ? { isActive: true } : {}),
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            menuItems: {
              where: activeOnly ? { isAvailable: true } : undefined,
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        }),
    );
  }

  async updateCategory(
    id: string,
    dto: UpdateMenuCategoryDto,
    currentUser: CurrentUserData,
  ) {
    const category = await this.ensureCategoryExists(id);
    this.ensureCanManageRestaurant(category.restaurant.ownerId, currentUser);

    const updated = await this.prisma.menuCategory.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.imageUrl?.trim(),
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        menuItems: true,
      },
    });

    await this.invalidateRestaurantMenuCache(category.restaurantId);
    return updated;
  }

  async updateCategoryStatus(
    id: string,
    isActive: boolean,
    currentUser: CurrentUserData,
  ) {
    const category = await this.ensureCategoryExists(id);
    this.ensureCanManageRestaurant(category.restaurant.ownerId, currentUser);

    const updated = await this.prisma.menuCategory.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await this.invalidateRestaurantMenuCache(category.restaurantId);
    return updated;
  }

  async removeCategory(id: string, currentUser: CurrentUserData) {
    const category = await this.ensureCategoryExists(id);
    this.ensureCanManageRestaurant(category.restaurant.ownerId, currentUser);

    const categoryItemCount = await this.prisma.menuItem.count({
      where: {
        categoryId: id,
      },
    });

    if (categoryItemCount > 0) {
      throw new BadRequestException(
        'Não é possível remover a categoria enquanto ela ainda possui itens vinculados',
      );
    }

    await this.prisma.menuCategory.delete({ where: { id } });
    await this.invalidateRestaurantMenuCache(category.restaurantId);

    return {
      message: 'Categoria removida com sucesso',
    };
  }

  async create(dto: CreateMenuItemDto, currentUser: CurrentUserData) {
    const restaurant = await this.ensureRestaurantExists(dto.restaurantId);
    this.ensureCanManageRestaurant(restaurant.ownerId, currentUser);

    if (dto.categoryId) {
      await this.ensureCategoryBelongsToRestaurant(dto.categoryId, dto.restaurantId);
    }

    this.validateOptions(dto.options);

    const created = await this.prisma.menuItem.create({
      data: {
        restaurantId: dto.restaurantId,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        price: new Prisma.Decimal(dto.price),
        imageUrl: dto.imageUrl?.trim(),
        isAvailable: dto.isAvailable ?? true,
        sortOrder: dto.sortOrder ?? 0,
        isFeatured: dto.isFeatured ?? false,
        promotionalText: dto.promotionalText?.trim(),
        allowsItemNotes: dto.allowsItemNotes ?? true,
        maxPerOrder: dto.maxPerOrder,
        options: dto.options?.length
          ? {
              create: this.mapOptionsForCreate(dto.options),
            }
          : undefined,
      },
      include: this.menuItemInclude(),
    });

    await this.invalidateRestaurantMenuCache(dto.restaurantId, created.id);
    return created;
  }

  async findByRestaurant(restaurantId: string, onlyAvailable?: boolean) {
    await this.ensureRestaurantExists(restaurantId);

    return this.cache.getOrSet(
      CacheKeys.menuItems(restaurantId, onlyAvailable),
      this.cache.getTtlSeconds('CACHE_TTL_MENU', 60),
      async () =>
        this.prisma.menuItem.findMany({
          where: {
            restaurantId,
            ...(onlyAvailable === true ? { isAvailable: true } : {}),
          },
          include: this.menuItemInclude(),
          orderBy: [
            { category: { sortOrder: 'asc' } },
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
        }),
    );
  }

  async findCatalogByRestaurant(restaurantId: string, onlyAvailable = true) {
    return this.cache.getOrSet(
      CacheKeys.menuCatalog(restaurantId, onlyAvailable),
      this.cache.getTtlSeconds('CACHE_TTL_MENU', 60),
      async () => {
        const restaurant = await this.prisma.restaurant.findUnique({
          where: { id: restaurantId },
          include: {
            city: {
              include: {
                state: true,
              },
            },
            deliveryZones: {
              where: onlyAvailable ? { isActive: true } : undefined,
              include: {
                neighborhood: true,
              },
              orderBy: { deliveryFee: 'asc' },
            },
          },
        });

        if (!restaurant) {
          throw new NotFoundException('Restaurante não encontrado');
        }

        const categories = await this.prisma.menuCategory.findMany({
          where: {
            restaurantId,
            ...(onlyAvailable ? { isActive: true } : {}),
          },
          include: {
            menuItems: {
              where: {
                ...(onlyAvailable ? { isAvailable: true } : {}),
              },
              include: this.menuItemInclude(),
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        const uncategorizedItems = await this.prisma.menuItem.findMany({
          where: {
            restaurantId,
            categoryId: null,
            ...(onlyAvailable ? { isAvailable: true } : {}),
          },
          include: this.menuItemInclude(),
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });

        const normalizedCategories: Array<
          (typeof categories)[number] & { itemCount: number }
        > = categories.map((category) => ({
          ...category,
          itemCount: category.menuItems.length,
        }));

        if (uncategorizedItems.length > 0) {
          normalizedCategories.push({
            id: 'uncategorized',
            restaurantId,
            name: 'Mais itens',
            description: 'Itens sem categoria definida',
            imageUrl: null,
            sortOrder: 999999,
            isActive: true,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            menuItems: uncategorizedItems,
            itemCount: uncategorizedItems.length,
          });
        }

        return {
          restaurant,
          categories: normalizedCategories,
          featuredItems: normalizedCategories
            .flatMap((category) => category.menuItems)
            .filter((item) => item.isFeatured),
        };
      },
    );
  }

  async findOne(id: string) {
    const cached = await this.cache.get<any>(CacheKeys.menuItem(id));
    if (cached) return cached;

    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        ...this.menuItemInclude(),
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

    await this.cache.set(
      CacheKeys.menuItem(id),
      item,
      this.cache.getTtlSeconds('CACHE_TTL_MENU_ITEM', 120),
    );
    return item;
  }

  async update(
    id: string,
    dto: UpdateMenuItemDto,
    currentUser: CurrentUserData,
  ) {
    const item = await this.ensureItemExists(id);
    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    if (dto.categoryId) {
      await this.ensureCategoryBelongsToRestaurant(dto.categoryId, item.restaurantId);
    }

    this.validateOptions(dto.options);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.options) {
        await tx.menuItemChoice.deleteMany({
          where: {
            option: {
              menuItemId: id,
            },
          },
        });

        await tx.menuItemOption.deleteMany({
          where: {
            menuItemId: id,
          },
        });
      }

      return tx.menuItem.update({
        where: { id },
        data: {
          categoryId: dto.categoryId === null ? null : dto.categoryId,
          name: dto.name?.trim(),
          description: dto.description?.trim(),
          price:
            dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
          imageUrl: dto.imageUrl?.trim(),
          isAvailable: dto.isAvailable,
          sortOrder: dto.sortOrder,
          isFeatured: dto.isFeatured,
          promotionalText: dto.promotionalText?.trim(),
          allowsItemNotes: dto.allowsItemNotes,
          maxPerOrder: dto.maxPerOrder,
          options: dto.options
            ? {
                create: this.mapOptionsForCreate(
                  dto.options as CreateMenuItemOptionDto[],
                ),
              }
            : undefined,
        },
        include: this.menuItemInclude(),
      });
    });

    await this.invalidateRestaurantMenuCache(item.restaurantId, id);
    return updated;
  }

  async updateStatus(
    id: string,
    isAvailable: boolean,
    currentUser: CurrentUserData,
  ) {
    const item = await this.ensureItemExists(id);
    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    const updated = await this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable },
      select: {
        id: true,
        name: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    await this.invalidateRestaurantMenuCache(item.restaurantId, id);
    return updated;
  }

  async remove(id: string, currentUser: CurrentUserData) {
    const item = await this.ensureItemExists(id);
    this.ensureCanManageRestaurant(item.restaurant.ownerId, currentUser);

    await this.prisma.menuItem.delete({
      where: { id },
    });

    await this.invalidateRestaurantMenuCache(item.restaurantId, id);
    return {
      message: 'Item removido com sucesso',
    };
  }

  private menuItemInclude(): Prisma.MenuItemInclude {
    return {
      category: true,
      options: {
        where: {
          isActive: true,
        },
        include: {
          choices: {
            where: {
              isActive: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }

  private mapOptionsForCreate(options: CreateMenuItemOptionDto[]) {
    return options.map((option, optionIndex) => ({
      name: option.name.trim(),
      description: option.description?.trim(),
      optionType: option.optionType,
      required: option.required ?? false,
      minSelect: option.minSelect,
      maxSelect: option.maxSelect,
      sortOrder: option.sortOrder ?? optionIndex,
      isActive: option.isActive ?? true,
      choices: option.choices?.length
        ? {
            create: option.choices.map((choice: CreateMenuItemChoiceDto, choiceIndex: number) => ({
              name: choice.name.trim(),
              description: choice.description?.trim(),
              price:
                choice.price !== undefined
                  ? new Prisma.Decimal(choice.price)
                  : null,
              imageUrl: choice.imageUrl?.trim(),
              sortOrder: choice.sortOrder ?? choiceIndex,
              isActive: choice.isActive ?? true,
              isDefault: choice.isDefault ?? false,
            })),
          }
        : undefined,
    }));
  }

  private validateOptions(options?: CreateMenuItemOptionDto[]) {
    if (!options) {
      return;
    }

    for (const option of options) {
      if (option.minSelect !== undefined && option.maxSelect !== undefined) {
        if (option.minSelect > option.maxSelect) {
          throw new BadRequestException(
            `No grupo "${option.name}", minSelect não pode ser maior que maxSelect`,
          );
        }
      }

      if (option.required && option.maxSelect === 0) {
        throw new BadRequestException(
          `No grupo "${option.name}", um grupo obrigatório precisa aceitar ao menos 1 escolha`,
        );
      }

      if ((option.choices?.length ?? 0) === 0) {
        throw new BadRequestException(
          `O grupo "${option.name}" precisa ter ao menos uma escolha`,
        );
      }
    }
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

  private async ensureCategoryExists(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  private async ensureCategoryBelongsToRestaurant(
    categoryId: string,
    restaurantId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        restaurantId: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    if (category.restaurantId !== restaurantId) {
      throw new BadRequestException(
        'A categoria informada não pertence ao restaurante do item',
      );
    }
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

  private async invalidateRestaurantMenuCache(
    restaurantId: string,
    itemId?: string,
  ) {
    await this.cache.delMany([
      CacheKeys.restaurantsAll,
      CacheKeys.restaurantsActive,
      CacheKeys.restaurantDetail(restaurantId),
      CacheKeys.publicDeliveryZones(restaurantId),
      ...getRestaurantMenuCacheKeys(restaurantId),
      ...(itemId ? [CacheKeys.menuItem(itemId)] : []),
    ]);

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
