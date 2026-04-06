import { Module } from '@nestjs/common';
import { MeController } from '../me/me.controller';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [CouponsController, AdminCouponsController, MeController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
