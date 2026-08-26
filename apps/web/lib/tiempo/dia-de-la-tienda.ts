/**
 * El día de la tienda, que es el de **Europe/Madrid** y no el del navegador.
 *
 * ⚠️⚠️ POR QUÉ EXISTE ESTE FICHERO, con el caso real que lo pagó. El panel pedía
 * «Válido hasta» con un `<input type="date">` y guardaba
 * `new Date("2026-08-26").toISOString()`, que es **medianoche UTC del PRINCIPIO del
 * 26**. Y la base compara `now() > valido_hasta`, así que el código moría en el
 * instante en que empezaba el día que llevaba escrito: **regalaba cero días del día
 * que nombraba.**
 *
 * No fue un despiste de quien lo usó: Jonathan creó tres códigos así —el 24 y el 25
 * de agosto— y los tres murieron la misma noche. Al día siguiente los tres decían
 * «Ese código ha caducado» con la fecha de hoy puesta. Un campo que dice «hasta el
 * 26» y no vale el 26 no es un campo confuso, es un campo equivocado.
 *
 * ⚠️ Y la zona va EXPLÍCITA, no la del navegador, por lo mismo que ya decía
 * `hoyEnEspana()` en la pantalla de compras nuevas: la base razona en
 * `Europe/Madrid` (ver la función `dia_fiscal`), y un portátil con la zona mal
 * puesta —o un asesor de viaje— guardaría un instante distinto del que el tendero
 * quiso. El día de la tienda es el de la tienda.
 *
 * *(La `hoyEnEspana()` de `compras/nueva` es esta misma idea y su sitio natural es
 * este fichero. No se mueve aquí de momento para no tocar una pantalla que no
 * entraba en este arreglo.)*
 */

/**
 * Cuánto se desvía Europe/Madrid de UTC en un instante dado, en minutos.
 * +60 en invierno (CET), +120 en verano (CEST).
 *
 * Se calcula formateando el instante en esa zona y volviéndolo a leer como si
 * fuera UTC: la diferencia entre los dos es el desplazamiento. Es la forma de
 * hacerlo sin meter una librería de husos por una cuenta de dos líneas.
 */
function desplazamientoDeMadrid(momento: Date): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(momento);

  const v = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? 0);

  // `hour` puede venir como 24 en algunas implementaciones a medianoche.
  const comoSiFueraUtc = Date.UTC(
    v("year"),
    v("month") - 1,
    v("day"),
    v("hour") % 24,
    v("minute"),
    v("second"),
  );

  return (comoSiFueraUtc - momento.getTime()) / 60_000;
}

/**
 * El último instante de un día del calendario español, en ISO, listo para guardar
 * en un `timestamptz`.
 *
 * `"2026-08-26"` → `"2026-08-26T21:59:59.999Z"`, que son las 23:59:59.999 en Madrid.
 * O sea: **el día 26 entero cuenta**, que es lo que quiere decir «válido hasta el 26».
 *
 * ⚠️ El desplazamiento se mide con un ancla al MEDIODÍA de ese día y no a las 23:59,
 * y eso importa dos domingos al año: a las 23:59:59.999 UTC ya es el día siguiente en
 * Madrid, así que anclar ahí leería el huso del día equivocado. El mediodía siempre
 * cae en el mismo día y —como los cambios de hora de la UE son a las 03:00 locales—
 * en el mismo estado de horario de verano que el final del día.
 *
 * Devuelve `null` con una entrada vacía, para que «sin fecha» siga siendo «sin fecha»
 * y no se convierta en una fecha inventada.
 */
export function finDelDiaEnEspana(fecha: string): string | null {
  if (!fecha) return null;

  const [anio, mes, dia] = fecha.split("-").map(Number);
  if (!anio || !mes || !dia) return null;

  const ancla = Date.UTC(anio, mes - 1, dia, 12, 0, 0, 0);
  const desplazamiento = desplazamientoDeMadrid(new Date(ancla));

  const finLocal = Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999);
  return new Date(finLocal - desplazamiento * 60_000).toISOString();
}
