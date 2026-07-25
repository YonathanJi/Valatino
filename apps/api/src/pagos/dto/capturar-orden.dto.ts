import { IsString, Matches, MaxLength } from "class-validator";

/**
 * Captura de una orden de PayPal aprobada por el comprador.
 * Los IDs de orden de PayPal son alfanuméricos en mayúsculas (p.ej. "5O190127TN364715T").
 */
export class CapturarOrdenDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Z0-9]{5,64}$/, { message: "order_id no tiene el formato de una orden de PayPal" })
  order_id!: string;
}
