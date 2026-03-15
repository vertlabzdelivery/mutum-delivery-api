import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantDeliveryZonesController } from './restaurant-delivery-zones.controller';

describe('RestaurantDeliveryZonesController', () => {
  let controller: RestaurantDeliveryZonesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantDeliveryZonesController],
    }).compile();

    controller = module.get<RestaurantDeliveryZonesController>(RestaurantDeliveryZonesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
