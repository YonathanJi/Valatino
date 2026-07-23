import { IsInt, Max, Min } from "class-validator";

export class GenerarHistorialDto {
  @IsInt({ message: "anio debe ser un entero" })
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsInt({ message: "mes debe ser un entero" })
  @Min(1)
  @Max(12)
  mes!: number;
}
