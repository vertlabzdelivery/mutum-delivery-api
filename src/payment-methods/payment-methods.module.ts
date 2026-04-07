import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { AdminPaymentMethodsController } from './admin-payment-methods.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentMethodsController, AdminPaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodsModule {}
