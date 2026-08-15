import type { FacturaDeLaVenta } from "@valatino/types";

/**
 * Lo que queda facturado de una venta, después de las devoluciones.
 *
 * ⚠️⚠️ POR QUÉ ESTO HACE FALTA, que es la pregunta que lo originó: «¿cuál es la
 * factura final?». **No existe tal documento.** Una factura emitida no se
 * modifica jamás —lo impide la ley, el trigger `trg_factura_inmutable` y la
 * cadena de huellas—, así que una devolución no reescribe la factura: emite una
 * rectificativa en negativo (077). El estado fiscal de la venta es el CONJUNTO:
 *
 *     VALF202600100   +3,02 €
 *     VALR202600100   −0,62 €
 *     VALR202600101   −2,40 €
 *                     ────────
 *                      0,00 €   ← esto
 *
 * Sin este resumen la ficha era una lista plana y quien la mirase tenía que
 * hacer la resta de cabeza. La suma es justo la parte que una persona hace mal.
 */
export interface ResumenDeLaVenta {
  /** Lo emitido: simplificadas y completas vigentes. Siempre ≥ 0. */
  facturado: number;
  /** Lo rectificado por devoluciones. Va en NEGATIVO, como los documentos. */
  rectificado: number;
  /** `facturado + rectificado`: lo que la venta sostiene hoy. */
  neto: number;
  /**
   * Si hay algo que resumir. Con una sola factura y sin devoluciones, el resumen
   * repetiría el importe que ya está en su fila — y una línea que no añade nada
   * es una línea que enseña a no leer las que sí.
   */
  hayQueResumir: boolean;
}

/**
 * ⚠️ SOLO CUENTAN LAS VIGENTES, y es la misma regla del libro y del 303 (073 §5):
 * una simplificada canjeada por una completa sigue existiendo pero no cuenta, o
 * la venta aparecería facturada dos veces.
 *
 * ⚠️ SE SUMA EN CÉNTIMOS ENTEROS. Los importes vienen de `numeric(12,2)`, pero en
 * JavaScript `3.02 - 0.62 - 2.40` da `-4.44e-16` y no cero: el neto de una venta
 * devuelta entera se pintaría como «-0,00 €». Es el mismo fallo que cazó el test
 * del formateador de importes del PDF, un nivel más arriba.
 */
export function resumenDeLaVenta(facturas: FacturaDeLaVenta[]): ResumenDeLaVenta {
  const vigentes = facturas.filter((f) => f.vigente);
  const centimos = (n: number) => Math.round(n * 100);

  const facturadoCent = vigentes
    .filter((f) => f.tipo !== "rectificativa")
    .reduce((suma, f) => suma + centimos(f.total), 0);

  const rectificadoCent = vigentes
    .filter((f) => f.tipo === "rectificativa")
    .reduce((suma, f) => suma + centimos(f.total), 0);

  return {
    facturado: facturadoCent / 100,
    rectificado: rectificadoCent / 100,
    neto: (facturadoCent + rectificadoCent) / 100,
    /**
     * Con rectificativas siempre; y también con más de una fila EN PANTALLA
     * —`facturas`, no `vigentes`—, que es la parte que se cuenta mal.
     *
     * ⚠️ El caso que lo decide: una simplificada canjeada por su completa pinta
     * DOS filas de 3,02 €, y solo una cuenta. Mirar `vigentes` daría «una, no
     * hace falta resumir» justo en la pantalla donde alguien puede leer 6,04 €.
     */
    hayQueResumir: rectificadoCent !== 0 || facturas.length > 1,
  };
}
