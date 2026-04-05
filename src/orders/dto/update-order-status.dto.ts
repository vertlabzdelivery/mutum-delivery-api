import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Motivo do cancelamento — obrigatório quando status === CANCELED.
   * Enviado pelo painel do restaurante via modal de motivo.
   */
  @ValidateIf((o) => o.status === OrderStatus.CANCELED)
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
