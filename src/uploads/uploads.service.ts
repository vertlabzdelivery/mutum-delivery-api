import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';

type MulterLikeFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Injectable()
export class UploadsService {
  private readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  async uploadRestaurantLogo(
    file: MulterLikeFile | undefined,
    restaurantId: string,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.ensureRestaurantAccess(restaurantId, currentUser);

    return this.uploadImage(file, {
      restaurantId,
      maxBytes: this.getBytesEnv('BLOB_MAX_RESTAURANT_LOGO_BYTES', 716_800),
      pathname: `restaurants/${restaurant.id}/logo/${this.buildFileName(
        restaurant.name || 'restaurante',
        file?.mimetype,
      )}`,
    });
  }

  async uploadMenuItemImage(
    file: MulterLikeFile | undefined,
    restaurantId: string,
    currentUser: CurrentUserData,
  ) {
    await this.ensureRestaurantAccess(restaurantId, currentUser);

    return this.uploadImage(file, {
      restaurantId,
      maxBytes: this.getBytesEnv('BLOB_MAX_MENU_ITEM_IMAGE_BYTES', 921_600),
      pathname: `restaurants/${restaurantId}/menu/${this.buildFileName(
        'item',
        file?.mimetype,
      )}`,
    });
  }

  private async uploadImage(
    file: MulterLikeFile | undefined,
    options: { restaurantId: string; maxBytes: number; pathname: string },
  ) {
    this.ensureBlobReady();

    if (!file?.buffer?.length) {
      throw new BadRequestException('Selecione uma imagem para enviar.');
    }

    const mimetype = String(file.mimetype || '').toLowerCase();
    const size = Number(file.size || file.buffer.length || 0);

    if (!this.allowedMimeTypes.has(mimetype)) {
      throw new BadRequestException(
        'Formato inválido. Envie JPG, PNG ou WEBP.',
      );
    }

    if (size <= 0) {
      throw new BadRequestException('A imagem enviada está vazia.');
    }

    if (size > options.maxBytes) {
      throw new BadRequestException(
        `Imagem muito pesada. Limite atual: ${this.formatKilobytes(
          options.maxBytes,
        )}.`,
      );
    }

    try {
      const blob = await put(options.pathname, file.buffer, {
        access: 'public',
        contentType: mimetype,
      });

      return {
        url: blob.url,
        pathname: blob.pathname,
        contentType: mimetype,
        size,
        restaurantId: options.restaurantId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      throw new InternalServerErrorException(
        `Não foi possível enviar a imagem para o Blob. ${message}`,
      );
    }
  }

  private async ensureRestaurantAccess(
    restaurantId: string,
    currentUser: CurrentUserData,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        ownerId: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante não encontrado.');
    }

    if (
      currentUser.role !== Role.ADMIN &&
      restaurant.ownerId !== currentUser.userId
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para enviar imagem para este restaurante.',
      );
    }

    return restaurant;
  }

  private ensureBlobReady() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new InternalServerErrorException(
        'BLOB_READ_WRITE_TOKEN não configurado no ambiente.',
      );
    }
  }

  private getBytesEnv(envName: string, fallback: number) {
    const parsed = Number(process.env[envName]);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }

    return fallback;
  }

  private buildFileName(baseName: string, mimeType?: string) {
    const normalizedBase = this.slugify(baseName || 'imagem');
    const extension = this.extensionFromMimeType(mimeType);
    return `${Date.now()}-${normalizedBase}-${randomUUID().slice(0, 8)}.${extension}`;
  }

  private extensionFromMimeType(mimeType?: string) {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'jpg';
    }
  }

  private slugify(value: string) {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'imagem';
  }

  private formatKilobytes(bytes: number) {
    return `${Math.round(bytes / 1024)} KB`;
  }
}
