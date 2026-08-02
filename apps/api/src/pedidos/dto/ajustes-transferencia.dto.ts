import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * La cuenta de cobro que se edita desde TI → Ajustes.
 *
 * El IBAN no se valida aquí con una expresión regular: su corrección depende de
 * un dígito de control (mod-97), no de su forma. Eso lo comprueba el servicio
 * con `ibanValido`, que es la misma regla que usa la tienda — una sola, en
 * `@valatino/types`, para que no acaben divergiendo como pasó con el CHECK de
 * `modulo`.
 */
export class GuardarAjustesTransferenciaDto {
  @IsString()
  @MaxLength(42)
  iban!: string;

  @IsString()
  @MaxLength(140)
  titular!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  banco?: string;

  /** Tope de 30: el plazo es también lo que el pedido retiene su stock. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  dias_plazo?: number;
}
