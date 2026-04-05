import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservabilityModule } from '../observability/observability.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [NotificationsModule, ObservabilityModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
