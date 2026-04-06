import { Module } from '@nestjs/common';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservabilityModule } from '../observability/observability.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [NotificationsModule, ObservabilityModule, CouponsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
