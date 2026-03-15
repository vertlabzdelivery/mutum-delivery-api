import { Test, TestingModule } from '@nestjs/testing';
import { RestaurantDeliveryZonesService } from './restaurant-delivery-zones.service';

describe('RestaurantDeliveryZonesService', () => {
  let service: RestaurantDeliveryZonesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RestaurantDeliveryZonesService],
    }).compile();

    service = module.get<RestaurantDeliveryZonesService>(RestaurantDeliveryZonesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
