import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * Lo que envía el widget de la página de confirmación.
 *
 * Los dos valores son obligatorios porque el widget no permite enviar a medias:
 * lo opcional es *calificar*, no dejar media opinión. El comentario sí es
 * opcional y se pide solo después de haber puntuado.
 */
export class CalificarDto {
  /** 1 fácil · 2 regular · 3 difícil (CES) */
  @IsInt()
  @Min(1)
  @Max(3)
  esfuerzo!: number;

  /** 1 a 5 (CSAT) */
  @IsInt()
  @Min(1)
  @Max(5)
  satisfaccion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentario?: string;
}
