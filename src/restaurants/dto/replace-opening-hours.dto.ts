import { IsArray, IsInt, IsMilitaryTime, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OpeningHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsMilitaryTime()
  openTime: string;

  @IsMilitaryTime()
  closeTime: string;
}

export class ReplaceOpeningHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningHourItemDto)
  hours: OpeningHourItemDto[];
}
