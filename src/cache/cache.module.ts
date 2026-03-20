import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './cache.service';

@Global()
@Module({
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
