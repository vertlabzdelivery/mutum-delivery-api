import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { AuthProtectionService } from './auth-protection.service';
import { EphemeralStoreService } from './ephemeral-store.service';

@Module({
  imports: [CacheModule],
  providers: [EphemeralStoreService, AuthProtectionService],
  exports: [EphemeralStoreService, AuthProtectionService],
})
export class SecurityModule {}
