import { Global, Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ObservabilityModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
