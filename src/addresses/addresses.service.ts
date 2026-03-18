import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAddressDto, currentUser: CurrentUserData) {
    await this.ensureCityAndNeighborhoodAreValid(dto.cityId, dto.neighborhoodId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.userAddress.updateMany({
          where: {
            userId: currentUser.userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      const hasAnyAddress = await tx.userAddress.count({
        where: {
          userId: currentUser.userId,
        },
      });

      const address = await tx.userAddress.create({
        data: {
          userId: currentUser.userId,
          label: dto.label?.trim(),
          street: dto.street.trim(),
          number: dto.number.trim(),
          complement: dto.complement?.trim(),
          reference: dto.reference?.trim(),
          zipCode: dto.zipCode.trim(),
          cityId: dto.cityId,
          neighborhoodId: dto.neighborhoodId,
          isDefault: dto.isDefault ?? hasAnyAddress === 0,
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

      return address;
    });
  }

  async findMyAddresses(currentUser: CurrentUserData) {
    return this.prisma.userAddress.findMany({
      where: {
        userId: currentUser.userId,
      },
      include: {
        city: {
          include: {
            state: true,
          },
        },
        neighborhood: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findMyDefaultAddress(currentUser: CurrentUserData) {
    const address = await this.prisma.userAddress.findFirst({
      where: {
        userId: currentUser.userId,
        isDefault: true,
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
      throw new NotFoundException('Nenhum endereço principal encontrado');
    }

    return address;
  }

  async findOne(id: string, currentUser: CurrentUserData) {
    const address = await this.prisma.userAddress.findUnique({
      where: { id },
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

    this.ensureAddressOwnership(address.userId, currentUser.userId);

    return address;
  }

  async update(
    id: string,
    dto: UpdateAddressDto,
    currentUser: CurrentUserData,
  ) {
    const existingAddress = await this.prisma.userAddress.findUnique({
      where: { id },
    });

    if (!existingAddress) {
      throw new NotFoundException('Endereço não encontrado');
    }

    this.ensureAddressOwnership(existingAddress.userId, currentUser.userId);

    const nextCityId = dto.cityId ?? existingAddress.cityId;
    const nextNeighborhoodId =
      dto.neighborhoodId ?? existingAddress.neighborhoodId;

    await this.ensureCityAndNeighborhoodAreValid(
      nextCityId,
      nextNeighborhoodId,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.userAddress.updateMany({
          where: {
            userId: currentUser.userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.userAddress.update({
        where: { id },
        data: {
          label: dto.label !== undefined ? dto.label.trim() : undefined,
          street: dto.street !== undefined ? dto.street.trim() : undefined,
          number: dto.number !== undefined ? dto.number.trim() : undefined,
          complement:
            dto.complement !== undefined ? dto.complement.trim() : undefined,
          reference:
            dto.reference !== undefined ? dto.reference.trim() : undefined,
          zipCode: dto.zipCode !== undefined ? dto.zipCode.trim() : undefined,
          cityId: dto.cityId,
          neighborhoodId: dto.neighborhoodId,
          isDefault: dto.isDefault,
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
    });
  }

  async updateDefault(
    id: string,
    isDefault: boolean,
    currentUser: CurrentUserData,
  ) {
    const address = await this.prisma.userAddress.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    this.ensureAddressOwnership(address.userId, currentUser.userId);

    if (!isDefault) {
      if (!address.isDefault) {
        return this.prisma.userAddress.findUnique({
          where: { id },
          include: {
            city: {
              include: {
                state: true,
              },
            },
            neighborhood: true,
          },
        });
      }

      const otherAddress = await this.prisma.userAddress.findFirst({
        where: {
          userId: currentUser.userId,
          id: { not: id },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!otherAddress) {
        throw new BadRequestException(
          'Você não pode remover o endereço principal sem ter outro endereço cadastrado',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.userAddress.update({
          where: { id },
          data: {
            isDefault: false,
          },
        });

        return tx.userAddress.update({
          where: { id: otherAddress.id },
          data: {
            isDefault: true,
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
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userAddress.updateMany({
        where: {
          userId: currentUser.userId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });

      return tx.userAddress.update({
        where: { id },
        data: {
          isDefault: true,
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
    });
  }

  async remove(id: string, currentUser: CurrentUserData) {
    const address = await this.prisma.userAddress.findUnique({
      where: { id },
    });

    if (!address) {
      throw new NotFoundException('Endereço não encontrado');
    }

    this.ensureAddressOwnership(address.userId, currentUser.userId);

    const wasDefault = address.isDefault;

    await this.prisma.$transaction(async (tx) => {
      await tx.userAddress.delete({
        where: { id },
      });

      if (wasDefault) {
        const newestAddress = await tx.userAddress.findFirst({
          where: {
            userId: currentUser.userId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (newestAddress) {
          await tx.userAddress.update({
            where: { id: newestAddress.id },
            data: {
              isDefault: true,
            },
          });
        }
      }
    });

    return {
      message: 'Endereço removido com sucesso',
    };
  }

  private async ensureCityAndNeighborhoodAreValid(
    cityId: string,
    neighborhoodId: string,
  ) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
    });

    if (!city) {
      throw new NotFoundException('Cidade não encontrada');
    }

    const neighborhood = await this.prisma.neighborhood.findUnique({
      where: { id: neighborhoodId },
    });

    if (!neighborhood) {
      throw new NotFoundException('Bairro não encontrado');
    }

    if (neighborhood.cityId !== cityId) {
      throw new BadRequestException(
        'O bairro informado não pertence à cidade selecionada',
      );
    }
  }

  private ensureAddressOwnership(addressUserId: string, currentUserId: string) {
    if (addressUserId !== currentUserId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este endereço',
      );
    }
  }
}