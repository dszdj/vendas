import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customer = "";

  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;

  @IsIn(["Pix", "Cartão de Crédito", "Cartão de Débito", "Dinheiro"])
  payment!: string;
}
