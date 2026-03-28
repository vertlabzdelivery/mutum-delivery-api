import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PushNotificationsService } from './push-notifications.service';
import { AblyRealtimeService } from './ably-realtime.service';
import { RealtimeController } from './realtime.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [RealtimeController],
  providers: [PushNotificationsService, AblyRealtimeService],
  exports: [PushNotificationsService, AblyRealtimeService],
})
export class NotificationsModule {}
