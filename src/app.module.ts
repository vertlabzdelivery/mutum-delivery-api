import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { UsersModule } from './users/users.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { LocationsModule } from './locations/locations.module';
import { AddressesModule } from './addresses/addresses.module';
import { RestaurantDeliveryZonesModule } from './restaurant-delivery-zones/restaurant-delivery-zones.module';
import { BillingModule } from './billing/billing.module';
import { validateEnv } from './config/env.validation';
import { CacheModule } from './cache/cache.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadsModule } from './uploads/uploads.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    CacheModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RestaurantsModule,
    MenuModule,
    OrdersModule,
    LocationsModule,
    AddressesModule,
    RestaurantDeliveryZonesModule,
    BillingModule,
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
