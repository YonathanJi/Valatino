import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Crear un código de descuento desde el panel de TI (083).
 *
 * ⚠️⚠️ ESTE DTO NO DECIDE NADA DE NEGOCIO, y hay que tenerlo claro: valida FORMA
 * —que el porcentaje sea un número entre 1 y 90, que la fecha sea una fecha— para
 * dar un 400 legible en vez de un error de base. Quién puede usar el código, si está
 * vigente y cuánto descuenta lo dice `codigo_descuento_aplicable`, que es el único
 * sitio donde eso vive.
 *
 * ⚠️ Los límites son los MISMOS que los CHECK de `codigos_descuento`. Si alguien
 * cambia uno tiene que cambiar el otro; el CHECK es el que de verdad garantiza, esto
 * es solo el mensaje bonito. Y por eso el servicio traduce el error del CHECK en vez
 * de confiar en que esto lo haya cazado.
 */
export class CrearCodigoDescuentoDto {
  /**
   * ⚠️ No se valida la FORMA del código a propósito: el formato lo elige quien lo
   * crea. Una regex aquí sería una segunda opinión sobre qué es un código válido, y
   * la unicidad la garantiza el índice sobre `upper(btrim(codigo))`.
   */
  @IsString({ message: "El código tiene que ser texto" })
  @Length(3, 40, { message: "El código tiene que tener entre 3 y 40 caracteres" })
  codigo!: string;

  @IsIn(["porcentaje", "envio_gratis"], {
    message: "El tipo solo puede ser «porcentaje» o «envio_gratis»",
  })
  tipo!: "porcentaje" | "envio_gratis";

  /**
   * ⚠️⚠️ EL TOPE DE 90 NO ES ESTÉTICO. Deja lejos las dos paredes que la 083 dejó
   * escritas: `pedidos.total > 0` es estricto, y Stripe no cobra por debajo de
   * 0,50 €. Un cupón del 100 % es otra funcionalidad —hay que decidir si devenga, si
   * se factura y si es art. 78.Tres.2 o entrega gratuita del art. 9 LIVA—, no un
   * porcentaje más grande.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El porcentaje tiene que ser un número" })
  @Min(1, { message: "Un descuento del 0 % no descuenta nada" })
  @Max(90, { message: "El máximo es el 90 %. Un cupón del 100 % es otra cosa: ver la 083" })
  porcentaje?: number | null;

  /**
   * ⚠️ Lo que se PUBLICA con el código, no una nota interna. Art. 19 LOCM obliga a
   * anunciar la duración y las condiciones de la promoción.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "La descripción no puede pasar de 300 caracteres" })
  descripcion?: string | null;

  /**
   * Compra mínima para que el código valga.
   *
   * ⭐ Y es la defensa práctica contra el suelo de 0,50 € de Stripe: con un mínimo
   * razonable, el tope de la función no muerde nunca.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "Un mínimo de 0 no es un mínimo: déjalo vacío" })
  minimo_articulos?: number | null;

  /**
   * ⚠️ El tope de usos es BLANDO: se comprueba al aplicar el código y se consume en
   * el webhook, minutos después. Dos checkouts simultáneos con un código de un solo
   * uso lo gastan los dos. Está explicado en el §0.6 de la 083 y la pantalla lo dice.
   */
  @IsOptional()
  @IsInt({ message: "El máximo de usos tiene que ser un número entero" })
  @Min(1, { message: "Un máximo de 0 usos es un código apagado: usa el interruptor" })
  usos_maximos?: number | null;

  @IsOptional()
  @IsISO8601({}, { message: "«Válido desde» tiene que ser una fecha" })
  valido_desde?: string | null;

  @IsOptional()
  @IsISO8601({}, { message: "«Válido hasta» tiene que ser una fecha" })
  valido_hasta?: string | null;
}

/**
 * Editar un código.
 *
 * ⚠️⚠️ NO SE PUEDE CAMBIAR NI `codigo` NI `tipo` NI `porcentaje`, y no es pereza:
 * un código ya usado está congelado en `pedidos.descuento_codigo` de las ventas que
 * lo llevaron, y es el «medio de prueba admitido en derecho» que el art. 78.Tres.2
 * LIVA exige para que el descuento no forme parte de la base imponible. Cambiarle el
 * porcentaje a posteriori haría que la prueba dijera una cosa y la factura otra.
 *
 * Lo que sí se cambia es lo que no reescribe la historia: apagarlo, mover las fechas,
 * subir el tope de usos o corregir el texto que se publica. Para cambiar el
 * porcentaje se crea otro código.
 */
export class EditarCodigoDescuentoDto {
  @IsOptional()
  @IsBoolean({ message: "«activo» tiene que ser verdadero o falso" })
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: "La descripción no puede pasar de 300 caracteres" })
  descripcion?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: "Un mínimo de 0 no es un mínimo: déjalo vacío" })
  minimo_articulos?: number | null;

  @IsOptional()
  @IsInt({ message: "El máximo de usos tiene que ser un número entero" })
  @Min(1, { message: "Un máximo de 0 usos es un código apagado: usa el interruptor" })
  usos_maximos?: number | null;

  @IsOptional()
  @IsISO8601({}, { message: "«Válido desde» tiene que ser una fecha" })
  valido_desde?: string | null;

  @IsOptional()
  @IsISO8601({}, { message: "«Válido hasta» tiene que ser una fecha" })
  valido_hasta?: string | null;
}
