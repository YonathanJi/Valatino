import { IsInt, IsUUID, Min, Max } from "class-validator";

export class AddItemDto {
  @IsUUID("4", { message: "producto_id debe ser un UUID válido" })
  producto_id!: string;

  @IsInt({ message: "cantidad debe ser un número entero" })
  @Min(1, { message: "cantidad debe ser al menos 1" })
  @Max(99, { message: "cantidad máxima por operación: 99" })
  cantidad!: number;
}

export class UpdateItemDto {
  @IsInt({ message: "cantidad debe ser un número entero" })
  @Min(0, { message: "cantidad no puede ser negativa" })
  @Max(99, { message: "cantidad máxima por operación: 99" })
  cantidad!: number;
}
