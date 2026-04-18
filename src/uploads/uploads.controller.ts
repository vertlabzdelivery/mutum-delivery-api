import {
  Body,
  Controller,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../common/interfaces/current-user.interface';
import { UploadsService } from './uploads.service';

const uploadLimitBytes = 1_048_576;

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RESTAURANT)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('restaurant-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes },
    }),
  )
  uploadRestaurantLogo(
    @UploadedFile() file: any,
    @Body('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return this.uploadsService.uploadRestaurantLogo(file, restaurantId, currentUser);
  }

  @Post('restaurant-banner')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes },
    }),
  )
  uploadRestaurantBanner(
    @UploadedFile() file: any,
    @Body('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return this.uploadsService.uploadRestaurantBanner(file, restaurantId, currentUser);
  }

  @Post('menu-item-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes },
    }),
  )
  uploadMenuItemImage(
    @UploadedFile() file: any,
    @Body('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @CurrentUser() currentUser: CurrentUserData,
  ) {
    return this.uploadsService.uploadMenuItemImage(file, restaurantId, currentUser);
  }

  @Roles(Role.ADMIN)
  @Post('store-category-icon')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: uploadLimitBytes },
    }),
  )
  uploadStoreCategoryIcon(@UploadedFile() file: any) {
    return this.uploadsService.uploadStoreCategoryIcon(file);
  }
}
