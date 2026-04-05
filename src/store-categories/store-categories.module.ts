import { Module } from '@nestjs/common';
import { StoreCategoriesController } from './store-categories.controller';
import { StoreCategoriesService } from './store-categories.service';

@Module({
  controllers: [StoreCategoriesController],
  providers: [StoreCategoriesService],
  exports: [StoreCategoriesService],
})
export class StoreCategoriesModule {}
