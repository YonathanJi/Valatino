import { IsString, Matches } from "class-validator";

/** `YYYY-MM-DD` y nada más. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El periodo de la liquidación.
 *
 * ⚠️ Fechas de CALENDARIO, no instantes. Aceptar un ISO con hora invitaría a
 * mandar la hora del navegador de quien consulta, y quien decide a qué día
 * pertenece cada operación es la base con la zona de España (`dia_fiscal`, ver
 * la migración 068). Un `2026-04-01T00:00:00Z` de un navegador en Madrid es el
 * 1 de abril a las 02:00 locales, y las ventas de esas dos horas se caerían del
 * informe sin que nadie lo notara.
 */
export class LiquidacionIvaQueryDto {
  @IsString()
  @Matches(SOLO_FECHA, { message: "La fecha de inicio debe ser YYYY-MM-DD" })
  desde!: string;

  @IsString()
  @Matches(SOLO_FECHA, { message: "La fecha de fin debe ser YYYY-MM-DD" })
  hasta!: string;
}

/**
 * La fecha de expedición de una factura de compra ya registrada. Se corrige, no
 * se inventa: las compras anteriores a la 068 nacieron sin este dato y hay que
 * cogerlo del PDF.
 */
export class FijarFechaFacturaDto {
  @IsString()
  @Matches(SOLO_FECHA, { message: "La fecha de la factura debe ser YYYY-MM-DD" })
  fechaFactura!: string;
}
