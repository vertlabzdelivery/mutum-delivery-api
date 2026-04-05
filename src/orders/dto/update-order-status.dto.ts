import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Motivo do cancelamento — obrigatório no frontend quando status === CANCELED,
   * mas mantido opcional aqui para evitar falsos erros de validação de tipo.
   * O controller garante que seja usado como nota quando presente.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cancelReason?: string;
}
