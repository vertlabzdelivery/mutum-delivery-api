import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { UsersModule } from '../users/users.module';
import { ApiBrasilSmsService } from './apibrasil-sms.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    PassportModule,
    JwtModule.register({}),
    SecurityModule,
    ObservabilityModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ApiBrasilSmsService],
})
export class AuthModule {}
