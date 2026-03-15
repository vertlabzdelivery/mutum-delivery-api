import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateNeighborhoodDto } from './dto/create-neighborhood.dto';
import { CreateStateDto } from './dto/create-state.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createState(dto: CreateStateDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const normalizedName = dto.name.trim();

    const existingByCode = await this.prisma.state.findUnique({
      where: { code: normalizedCode },
    });

    if (existingByCode) {
      throw new BadRequestException('Já existe um estado com essa sigla');
    }

    return this.prisma.state.create({
      data: {
        name: normalizedName,
        code: normalizedCode,
      },
    });
  }

  async findStates() {
    return this.prisma.state.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findStateById(id: string) {
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

    return this.prisma.city.create({
      data: {
        name: normalizedName,
        stateId: dto.stateId,
      },
      include: {
        state: true,
      },
    });
  }

  async findCitiesByState(stateId: string) {
    const state = await this.prisma.state.findUnique({
      where: { id: stateId },
    });

    if (!state) {
      throw new NotFoundException('Estado não encontrado');
    }

    return this.prisma.city.findMany({
      where: { stateId },
      orderBy: {
        name: 'asc',
      },
      include: {
        state: true,
      },
    });
  }

  async findCityById(id: string) {
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

    return this.prisma.neighborhood.create({
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
  }

  async findNeighborhoodsByCity(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
    });

    if (!city) {
      throw new NotFoundException('Cidade não encontrada');
    }

    return this.prisma.neighborhood.findMany({
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
    });
  }

  async findNeighborhoodById(id: string) {
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
  }
}