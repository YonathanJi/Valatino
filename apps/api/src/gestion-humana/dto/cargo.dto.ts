import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CrearCargoDto {
  /**
   * Código corto y estable (GER, DIRCOM…). Es la referencia que usan las
   * plantillas de permisos y los informes, así que se fija al crear y no se
   * cambia después.
   */
  @IsString()
  @MinLength(2, { message: "codigo debe tener al menos 2 caracteres" })
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_]+$/, { message: "codigo solo admite letras, números y guion bajo" })
  codigo!: string;

  @IsString()
  @MinLength(3, { message: "nombre debe tener al menos 3 caracteres" })
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;
}

export class ActualizarCargoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  /** Desactivar retira el cargo del selector de altas sin tocar a quien lo ocupa. */
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
