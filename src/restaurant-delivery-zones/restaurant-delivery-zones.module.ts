import { Module } from '@nestjs/common';
import { RestaurantDeliveryZonesController } from './restaurant-delivery-zones.controller';
import { RestaurantDeliveryZonesService } from './restaurant-delivery-zones.service';

@Module({
  controllers: [RestaurantDeliveryZonesController],
  providers: [RestaurantDeliveryZonesService],
})
export class RestaurantDeliveryZonesModule {}