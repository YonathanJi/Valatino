import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CrearReembolsoDto {
  /**
   * Importe a devolver. Si se omite, se devuelve todo lo que quede pendiente:
   * así el "reembolso total" no depende de que el panel calcule bien la resta
   * cuando ya hubo devoluciones parciales.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "importe admite como máximo 2 decimales" })
  @Min(0.01, { message: "importe debe ser mayor que 0" })
  importe?: number;

  /** Nota interna para la traza contable. No se le muestra al cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
