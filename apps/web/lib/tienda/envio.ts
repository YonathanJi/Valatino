/**
 * Lo que se le dice al cliente sobre los gastos de envío.
 *
 * ⚠️⚠️ AQUÍ NO SE CALCULA EL PORTE, Y ES LO MÁS IMPORTANTE DE ESTE FICHERO. El
 * importe lo decide `coste_envio_de` en la base de datos (migración 080 §1),
 * porque es el que se le COBRA al cliente y el que se le FACTURA. Esto solo pone
 * en castellano lo que la API ya ha dicho.
 *
 * Si algún día alguien escribe aquí «si subtotal >= umbral, gratis», la tienda
 * tendrá la regla en dos sitios: el día que difieran, la pantalla dirá un precio
 * y el cobro será otro. Es la lección de la 074.
 *
 * ── Por qué esto vive en `lib/` y no dentro del JSX ──────────────────────────
 *
 * Por lo mismo que `lib/seo/metadatos.ts`: **falla en silencio**. Un aviso de
 * envío gratis mal calculado no da error, no rompe la página y no sale en ningún
 * log; solo empuja al cliente a añadir 3 € que no le van a servir de nada, o
 * calla cuando le faltaba un euro. Es el perfil de avería que estuvo seis días
 * sin verse en los límites del multipart.
 */

/** Céntimos enteros. `4.95 * 100` es `494.99999999999994` en coma flotante. */
const centimos = (n: number): number => Math.round(n * 100);

export interface DatosEnvio {
  /** Suma de los artículos, IVA incluido. **BRUTO**: sin descontar el cupón. */
  subtotal: number;
  /** El porte que la API dice que se va a cobrar. 0 = gratis. */
  costeEnvio: number;
  /** El umbral de gratuidad, o `null` si la tienda no tiene ninguno. */
  envioGratisDesde: number | null;
  /**
   * El porte que un código de envío gratis está dejando de cobrar (083).
   *
   * ⚠️ Es lo ÚNICO que distingue «gratis porque pasaste del umbral» de «gratis
   * porque usaste un código», y las dos cosas se dicen distinto: la primera es un
   * logro del carrito y la segunda del código. Sin esto habría que deducirlo
   * comparando el subtotal con el umbral —o sea aplicando la regla aquí— que es lo
   * que este fichero tiene prohibido.
   */
  envioDescontado?: number;
}

/**
 * Cuánto le falta al carrito para el envío gratis, en euros. `null` cuando no
 * hay nada que decir.
 *
 * Devuelve `null` —y no 0— en los tres casos en que el mensaje no procede: sin
 * umbral, con el carrito vacío y cuando ya se ha alcanzado. Que el «ya lo tienes»
 * también sea `null` es a propósito: eso se dice mirando `costeEnvio === 0`, que
 * es la verdad de lo que se va a cobrar, y no deduciéndolo del umbral.
 */
export function faltaParaEnvioGratis(datos: DatosEnvio): number | null {
  const { subtotal, envioGratisDesde } = datos;

  if (envioGratisDesde === null || envioGratisDesde <= 0) return null;
  if (subtotal <= 0) return null;

  /**
   * ⚠️⚠️ EL UMBRAL SE MIDE SOBRE EL SUBTOTAL BRUTO, sin descontar el cupón, porque
   * es lo que hace `coste_envio_de` en la base (083 §0.5). Medirlo aquí sobre el
   * neto diría «te faltan 6,00» mientras la base ya está dando el envío gratis, y el
   * cliente añadiría 6 € que no le sirven de nada. `subtotal` YA es el bruto: el
   * descuento viaja aparte a propósito.
   */

  const falta = centimos(envioGratisDesde) - centimos(subtotal);
  return falta > 0 ? falta / 100 : null;
}

/**
 * El estado del envío de este carrito, para pintarlo sin decidir nada.
 *
 * - `gratis`      — no se cobra porte. La razón puede ser el umbral o que la
 *                   tienda no cobre envío; al cliente le da igual, y a la
 *                   pantalla también.
 * - `con_umbral`  — se cobra, y falta poco para que no. Es el único caso con un
 *                   mensaje que empuja.
 * - `se_cobra`    — se cobra y no hay umbral que ofrecer.
 * - `vacio`       — no hay nada en el carrito.
 */
export type EstadoEnvio = "vacio" | "gratis" | "con_umbral" | "se_cobra";

export function estadoEnvio(datos: DatosEnvio): EstadoEnvio {
  if (datos.subtotal <= 0) return "vacio";
  if (centimos(datos.costeEnvio) === 0) return "gratis";
  return faltaParaEnvioGratis(datos) !== null ? "con_umbral" : "se_cobra";
}

/**
 * Si el envío sale gratis **por un código** y no por el umbral (083).
 *
 * ⭐ Se decide con `envioDescontado`, que es lo que dice la API, y NO comparando el
 * subtotal con el umbral. Deducirlo sería aplicar la regla del porte en la pantalla,
 * que es justo lo que la cabecera de este fichero prohíbe.
 *
 * ⚠️ Y por eso vale 0 cuando el carrito ya pasaba del umbral: ahí el código no está
 * ahorrando nada, y decir «te ahorras 3,40 €» sería mentir.
 */
export function envioGratisPorCodigo(datos: DatosEnvio): boolean {
  return centimos(datos.costeEnvio) === 0 && centimos(datos.envioDescontado ?? 0) > 0;
}
