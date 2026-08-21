import { IsNumber, IsOptional, Max, Min } from "class-validator";

/**
 * La tarifa de envío que se edita desde TI → Ajustes (migración 080 §1).
 *
 * ⚠️ Los dos importes llevan el IVA INCLUIDO, como todos los precios del
 * catálogo. Lo que decide a qué tipo tributa el porte no se pone aquí: sigue el
 * de la mercancía y se reparte a prorrata (art. 78.Dos.1º LIVA).
 *
 * ⚠️⚠️ Y AQUÍ NO SE APLICA LA REGLA, SOLO SE GUARDAN LOS NÚMEROS. Quién decide
 * si un carrito paga porte es `coste_envio_de` en la base, y tiene que seguir
 * siendo el único: es el importe que se COBRA y el que se FACTURA, y tenerlo en
 * dos sitios es cobrar uno y facturar otro el día que difieran.
 */
export class GuardarAjustesEnvioDto {
  /**
   * Lo que se cobra de envío. 0 = envío gratis, y es una forma legítima de
   * apagarlo: es exactamente lo que hacía la tienda antes de la 080.
   *
   * El tope de 100 € no es una regla de negocio, es un cortafuegos contra el
   * dedo gordo: un 4995 en vez de 49,95 se cobraría a cada cliente hasta que
   * alguien lo viera.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  coste!: number;

  /**
   * Subtotal de artículos desde el que el envío sale gratis. `null` o ausente =
   * no hay umbral y siempre se cobra `coste`.
   *
   * ⚠️ El mínimo es 0,01 y no 0 a propósito, y lo respalda un CHECK en la base:
   * un umbral de 0 no es «gratis desde 0 €», es una casilla a medio rellenar que
   * dejaría el envío gratis siempre sin que nadie lo haya decidido. Para no
   * cobrar envío está `coste = 0`, que sí lo dice.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000)
  gratis_desde?: number | null;
}
