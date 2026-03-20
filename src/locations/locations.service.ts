import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateNeighborhoodDto } from './dto/create-neighborhood.dto';
import { CreateStateDto } from './dto/create-state.dto';
import { RedisCacheService } from '../cache/cache.service';
import { CacheKeys } from '../cache/cache.keys';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async createState(dto: CreateStateDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const normalizedName = dto.name.trim();

    const existingByCode = await this.prisma.state.findUnique({
      where: { code: normalizedCode },
    });

    if (existingByCode) {
      throw new BadRequestException('Já existe um estado com essa sigla');
    }

    const created = await this.prisma.state.create({
      data: {
        name: normalizedName,
        code: normalizedCode,
      },
    });

    await this.invalidateLocationsCache();
    return created;
  }

  async findStates() {
    return this.cache.getOrSet(
      CacheKeys.states,
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () =>
        this.prisma.state.findMany({
          orderBy: {
            name: 'asc',
          },
        }),
    );
  }

  async findStateById(id: string) {
    return this.cache.getOrSet(
      CacheKeys.state(id),
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () => {
        const state = await this.prisma.state.findUnique({
          where: { id },
          include: {
            cities: {
              orderBy: {
                name: 'asc',
              },
            },
          },
        });

        if (!state) {
          throw new NotFoundException('Estado não encontrado');
        }

        return state;
      },
    );
  }

  async createCity(dto: CreateCityDto) {
    const state = await this.prisma.state.findUnique({
      where: { id: dto.stateId },
    });

    if (!state) {
      throw new NotFoundException('Estado não encontrado');
    }

    const normalizedName = dto.name.trim();

    const existingCity = await this.prisma.city.findFirst({
      where: {
        name: normalizedName,
        stateId: dto.stateId,
      },
    });

    if (existingCity) {
      throw new BadRequestException('Já existe uma cidade com esse nome neste estado');
    }

    const created = await this.prisma.city.create({
      data: {
        name: normalizedName,
        stateId: dto.stateId,
      },
      include: {
        state: true,
      },
    });

    await this.invalidateLocationsCache(dto.stateId);
    return created;
  }

  async findCitiesByState(stateId: string) {
    const state = await this.prisma.state.findUnique({
      where: { id: stateId },
    });

    if (!state) {
      throw new NotFoundException('Estado não encontrado');
    }

    return this.cache.getOrSet(
      CacheKeys.citiesByState(stateId),
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () =>
        this.prisma.city.findMany({
          where: { stateId },
          orderBy: {
            name: 'asc',
          },
          include: {
            state: true,
          },
        }),
    );
  }

  async findCityById(id: string) {
    return this.cache.getOrSet(
      CacheKeys.city(id),
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () => {
        const city = await this.prisma.city.findUnique({
          where: { id },
          include: {
            state: true,
            neighborhoods: {
              orderBy: {
                name: 'asc',
              },
            },
          },
        });

        if (!city) {
          throw new NotFoundException('Cidade não encontrada');
        }

        return city;
      },
    );
  }

  async createNeighborhood(dto: CreateNeighborhoodDto) {
    const city = await this.prisma.city.findUnique({
      where: { id: dto.cityId },
    });

    if (!city) {
      throw new NotFoundException('Cidade não encontrada');
    }

    const normalizedName = dto.name.trim();

    const existingNeighborhood = await this.prisma.neighborhood.findFirst({
      where: {
        name: normalizedName,
        cityId: dto.cityId,
      },
    });

    if (existingNeighborhood) {
      throw new BadRequestException('Já existe um bairro com esse nome nesta cidade');
    }

    const created = await this.prisma.neighborhood.create({
      data: {
        name: normalizedName,
        cityId: dto.cityId,
      },
      include: {
        city: {
          include: {
            state: true,
          },
        },
      },
    });

    await this.invalidateLocationsCache(city.stateId, dto.cityId);
    return created;
  }

  async findNeighborhoodsByCity(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
    });

    if (!city) {
      throw new NotFoundException('Cidade não encontrada');
    }

    return this.cache.getOrSet(
      CacheKeys.neighborhoodsByCity(cityId),
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () =>
        this.prisma.neighborhood.findMany({
          where: { cityId },
          orderBy: {
            name: 'asc',
          },
          include: {
            city: {
              include: {
                state: true,
              },
            },
          },
        }),
    );
  }

  async findNeighborhoodById(id: string) {
    return this.cache.getOrSet(
      CacheKeys.neighborhood(id),
      this.cache.getTtlSeconds('CACHE_TTL_LOCATIONS', 86400),
      async () => {
        const neighborhood = await this.prisma.neighborhood.findUnique({
          where: { id },
          include: {
            city: {
              include: {
                state: true,
              },
            },
          },
        });

        if (!neighborhood) {
          throw new NotFoundException('Bairro não encontrado');
        }

        return neighborhood;
      },
    );
  }

  private async invalidateLocationsCache(stateId?: string, cityId?: string) {
    const keys = [CacheKeys.states];

    if (stateId) {
      keys.push(CacheKeys.state(stateId), CacheKeys.citiesByState(stateId));
    }

    if (cityId) {
      keys.push(CacheKeys.city(cityId), CacheKeys.neighborhoodsByCity(cityId));
    }

    await this.cache.delMany(keys);
  }
}
