import { Module } from '@nestjs/common';
import { ObservabilityController } from './observability.controller';
import { StructuredLoggerService } from './structured-logger.service';

@Module({
  controllers: [ObservabilityController],
  providers: [StructuredLoggerService],
  exports: [StructuredLoggerService],
})
export class ObservabilityModule {}
