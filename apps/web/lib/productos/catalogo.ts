import type { Producto } from "@valatino/types";
import { API_URL } from "@lib/api/url";

/**
 * Cómo se le pide el catálogo entero a la API, y qué se hace cuando no contesta.
 *
 * ── POR QUÉ ESTO ES UN MÓDULO PROPIO ──
 *
 * Vivía dentro de `lib/seo/mapa-del-sitio.ts`, que es quien lo estrenó. El 12/09 lo
 * necesitan también las **páginas de categoría**, y una página de la tienda que
 * importa de `lib/seo` para pedir productos es una pista falsa para quien lea el
 * código: pedir el catálogo no es una tarea de SEO. Así que se muda aquí, donde
 * cualquiera lo busca, y el mapa del sitio pasa a ser uno más de los que lo usan.
 *
 * ── LO QUE RESUELVE, Y VIENE DE DOS AVERÍAS MEDIDAS ──
 *
 * **1. `[]` significaba dos cosas.** La versión original devolvía una lista vacía
 * cuando algo fallaba, con lo que «no pude preguntar» y «pregunté y no hay
 * productos» eran el mismo valor. El 27/08 se midió en producción un sitemap con
 * **5 URLs en vez de 34** por esto, y Search Console lo daba por «Correcto» porque
 * el XML era válido. Por eso aquí `null` ≠ `[]`, y `!res.ok` cuenta como «no se
 * pudo»: Render contesta un 502/503 rápido mientras arranca, y leer eso como «el
 * catálogo está vacío» es creerse una respuesta que nadie ha dado.
 *
 * **2. Se pedían 200 productos y la API devuelve 50 como máximo.**
 * `productos.service.ts` hace `Math.min(50, …)` y **no avisa**: contesta 200 con
 * cincuenta artículos y un `total` que dice cuántos había de verdad. Por eso aquí se
 * PAGINA contra ese `total`, y si aun así falta algo se GRITA por el log.
 *
 * ⚠️⚠️ EL PLAZO DE 50 s ES PARA EL BUILD, NO PARA UNA PETICIÓN DE USUARIO. Está
 * dimensionado contra el arranque en frío de Render, que el 28/08 se midió en
 * **42,5 s**. Quien llame desde una página que se renderiza en cada visita tiene que
 * pasar un `plazoMs` corto — o mejor, no llamar en caliente: las páginas de
 * categoría son estáticas con `revalidate` justamente para que **nadie espere nunca**
 * a que la API despierte.
 */

/**
 * Cuánto vale una respuesta del catálogo antes de volver a preguntar.
 *
 * ⚠️ Es la caché del DATO, y no hay que confundirla con cada cuánto se repinta el
 * mapa del sitio (`REVALIDAR_S`) ni con la de una página. Hoy coinciden en 300 s de
 * casualidad; son decisiones distintas y pueden separarse sin tocarse.
 */
export const CACHE_CATALOGO_S = 300;

/**
 * ⚠️⚠️ EL PRESUPUESTO **TOTAL** PARA CONSEGUIR EL CATÁLOGO, REINTENTOS INCLUIDOS. Y
 * es un plazo y no «N intentos de M segundos» por una medición que rompió el diseño
 * anterior:
 *
 * El 28/08 se midió un arranque en frío de la API de **42,5 s** (`/health`, que no
 * toca la base; caliente responde en 0,3–0,7 s). Lo que estaba escrito en ESTADO.md
 * eran **8–16 s**, y con ese número se dimensionó la primera versión: 2 intentos de
 * 15 s + 5 s = 35 s de techo. **Un arranque de 42 s no cabía**, así que el mapa habría
 * vuelto a salir corto.
 *
 * ⭐ Contar el tiempo en un PLAZO en vez de en intentos hace que el techo sea un
 * número que se puede razonar contra un límite real, en vez de una multiplicación que
 * hay que recalcular cada vez que se toca un intento. Los 50 s se eligen para caber
 * en el **límite de 60 s de generación estática de Next**, que es el que manda en el
 * build — y el build es donde se cuece el mapa que se despliega.
 */
export const PLAZO_MS = 50_000;

/**
 * ⚠️⚠️ EL ARRANQUE EN FRÍO REAL SON **100 s**, NO LOS 42,5 QUE DICE EL PRESUPUESTO DE
 * ARRIBA. Medido el 12/09 contra producción, con la API dormida: tres peticiones de
 * 70 s seguidas **no la despertaron**, y una cuarta sin cortar tardó 100 s exactos.
 * Caliente responde en 0,3–0,7 s. El propio panel de Render lo avisa: «your free
 * instance will spin down with inactivity, which can delay requests by 50 seconds or
 * more».
 *
 * ⚠️ LO QUE ESO SIGNIFICA, Y NO SE PUEDE ARREGLAR SUBIENDO EL NÚMERO: Next mata la
 * generación de una página a los **60 s**, así que **ningún plazo que quepa ahí puede
 * cubrir un arranque de 100 s**. Con la API dormida, el mapa del sitio sale sin
 * catálogo —lo grita por el log— y las páginas salen degradadas. Es el precio del
 * plan **Free** de Render, no un fallo del código.
 *
 * ⭐ Se arregla con el plan de pago de Render, que está en la lista de pendientes
 * desde agosto. Mientras tanto, lo que el código puede hacer —y hace— es **degradar
 * en vez de morir**: ninguna página lanza, y `revalidate` las repara solas en cuanto
 * la API responde.
 *
 * Los 50 s se conservan porque siguen siendo lo máximo que cabe en el límite de Next
 * y porque **sí bastan cuando la API está caliente o a medio despertar**, que es el
 * caso normal. Bajarlos no ganaría nada y subirlos rompería el build.
 */

/**
 * El plazo para una PÁGINA, que no puede ser el mismo, y esto se aprendió en vivo.
 *
 * ⚠️⚠️ EL 12/09 SE VIO EL FALLO EN UN BUILD REAL: con la API caída, `next build`
 * murió con «took more than 60 seconds» en la portada, las tres legales, contacto y
 * las cuatro categorías — o sea **el despliegue entero de la tienda**. Next mata la
 * generación de una página a los **60 s**, y un plazo de 50 s no cabe ahí: entre que
 * la página hace su llamada, los metadatos hacen la suya y queda el trabajo de
 * renderizar, se pasa.
 *
 * ⭐ 20 s cabe con holgura aunque haya dos llamadas seguidas, y tiene la propiedad
 * que de verdad importa: **cuando la API no está, la página sale degradada en vez de
 * matar el despliegue**. Un catálogo que falta se arregla solo en la siguiente
 * revalidación; un build caído no se arregla solo.
 *
 * ⚠️ Es MENOS que el arranque en frío de Render (42,5 s medidos), y es deliberado: si
 * la API está dormida, esta página no la va a esperar. Quien la despierta es el
 * sitemap, que sí tiene plazo largo porque es una sola página y no la ve nadie. Con
 * el plan de pago de Render este número deja de importar.
 */
export const PLAZO_PAGINA_MS = 20_000;

/**
 * Lo máximo que se espera en UN intento suelto.
 *
 * ⚠️ Tiene que dejar hueco para un segundo intento dentro del plazo, y hay un test
 * que lo comprueba. El motivo son los DOS modos de fallo de Render, que piden cosas
 * distintas:
 *
 *   · **Render RETIENE la petición** mientras arranca → hace falta esperar mucho, y un
 *     intento largo lo resuelve solo.
 *   · **Render contesta un 502/503 rápido** mientras arranca → esperar no sirve de
 *     nada, hace falta REINTENTAR.
 *
 * Un intento largo con reintentos cubre los dos: si contesta rápido y mal, el intento
 * termina enseguida y queda plazo de sobra para volver a probar.
 */
export const CORTE_MAX_MS = 30_000;

/** Cuánto se deja pasar entre intentos, para que la API acabe de arrancar. */
export const ESPERA_MS = 3_000;

/**
 * Cuántos productos por página.
 *
 * ⚠️⚠️ SON 50 PORQUE ES EL TOPE REAL DE LA API, no una preferencia: pedir más es
 * pedir algo que no va a llegar, y el fallo #2 de la cabecera fue exactamente eso.
 * Si algún día sube el tope de `productos.service.ts`, este número puede subir con
 * él — pero pedir de más nunca sirve de nada.
 */
export const POR_PAGINA = 50;

/**
 * Tope de páginas, para que un `total` disparatado no deje esto girando.
 * 20 × 50 = 1000 productos, veinte veces el catálogo de hoy.
 */
export const PAGINAS_MAX = 20;

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Lo que se puede ajustar al pedir el mapa.
 *
 * ⚠️ Existe **solo para los tests**: en producción nadie pasa nada y valen `ESPERA_MS`
 * y `PLAZO_MS`. Sin esto, el test de «se rinde cuando se agota el plazo» tardaría
 * cincuenta segundos de reloj. Lo que se prueba es que reintenta y que el plazo lo
 * acota, no cuántos milisegundos duerme.
 */
export interface Opciones {
  esperaMs?: number;
  plazoMs?: number;
}

/**
 * El catálogo tal y como lo cuenta la API: lo que llegó, y cuántos dice que hay.
 *
 * ⭐ `total` es lo que permite saber si la respuesta venía completa. Sin él, cincuenta
 * productos y «todo el catálogo» son indistinguibles — que es el fallo #2.
 */
export interface Catalogo {
  productos: Producto[];
  /** `null` si la API no lo dijo. No es cero: es «no lo sé». */
  total: number | null;
}

/**
 * Una página del catálogo.
 *
 * ⚠️⚠️ DEVUELVE `null` CUANDO NO SE PUDO PREGUNTAR Y UNA LISTA VACÍA CUANDO LA API
 * DIJO QUE NO HAY NADA. Confundir los dos es la avería que trajo este fichero, y
 * `!res.ok` cuenta como «no se pudo»: Render responde un 502/503 rápido mientras
 * arranca, y leerlo como «el catálogo está vacío» es creerse una respuesta que nadie
 * ha dado.
 */
async function unaPagina(pagina: number, corteMs: number): Promise<Catalogo | null> {
  try {
    const res = await fetch(`${API_URL}/productos?limit=${POR_PAGINA}&page=${pagina}`, {
      next: { revalidate: CACHE_CATALOGO_S },
      signal: AbortSignal.timeout(corteMs),
    });
    if (!res.ok) return null;

    const cuerpo = (await res.json()) as { data?: Producto[]; total?: number } | Producto[];

    // Una API que devuelva el array pelado no dice cuántos hay, y eso se admite.
    if (Array.isArray(cuerpo)) return { productos: cuerpo, total: null };

    // Un 200 con un cuerpo que no trae lista tampoco es una respuesta.
    if (!Array.isArray(cuerpo.data)) return null;

    return {
      productos: cuerpo.data,
      total: typeof cuerpo.total === "number" ? cuerpo.total : null,
    };
  } catch {
    return null;
  }
}

/** Todas las páginas, hasta juntar el `total` que la propia API declaró. */
async function todoElCatalogo(corteMs: number): Promise<Catalogo | null> {
  const primera = await unaPagina(1, corteMs);
  if (primera === null) return null;

  const productos = [...primera.productos];
  const total = primera.total;

  // Sin `total` no hay forma de saber si falta algo: se devuelve lo que vino.
  if (total === null) return { productos, total };

  for (let pagina = 2; productos.length < total && pagina <= PAGINAS_MAX; pagina++) {
    const siguiente = await unaPagina(pagina, corteMs);
    /**
     * ⚠️ Si una página intermedia falla NO se tira lo ya traído —cincuenta fichas
     * valen más que ninguna— pero tampoco se disimula: se corta aquí y quien avisa
     * es `mapaDelSitio`, comparando lo reunido contra el `total`.
     */
    if (siguiente === null || siguiente.productos.length === 0) break;
    productos.push(...siguiente.productos);
  }

  return { productos, total };
}

/**
 * El catálogo, reintentando **hasta agotar el plazo**. `null` si no se consiguió.
 *
 * ⭐ El plazo manda, no un número de intentos: si Render contesta rápido y mal, se
 * reintenta muchas veces; si retiene la petición, un intento largo se la lleva. Ver
 * la nota de `CORTE_MAX_MS` para los dos modos de fallo.
 */
export async function pedirCatalogo(opciones: Opciones = {}): Promise<Catalogo | null> {
  const espera = opciones.esperaMs ?? ESPERA_MS;
  const limite = Date.now() + (opciones.plazoMs ?? PLAZO_MS);
  let intentos = 0;

  while (Date.now() < limite) {
    intentos++;
    const catalogo = await todoElCatalogo(Math.min(CORTE_MAX_MS, limite - Date.now()));
    if (catalogo !== null) return catalogo;

    // Si no queda plazo para la espera Y otro intento, no se insiste en balde.
    if (limite - Date.now() <= espera) break;
    await dormir(espera);
  }

  /**
   * ⚠️⚠️ ESTE GRITO ES LA MITAD DEL ARREGLO, y dice **cuántos intentos** a propósito:
   * «1 intento» significa que la API retuvo la petición hasta el corte, y «14» que
   * contestaba rápido y mal. Son dos averías distintas y el número las separa sin
   * tener que ir a mirar nada.
   */
  console.error(
    `[sitemap] La API de ${API_URL} no dio el catálogo en ${Math.round(
      (opciones.plazoMs ?? PLAZO_MS) / 1000,
    )} s (${intentos} intento(s)).`,
  );
  return null;
}
