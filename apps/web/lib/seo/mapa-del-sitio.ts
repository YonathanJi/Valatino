import type { MetadataRoute } from "next";
import type { Producto } from "@valatino/types";
import { API_URL } from "@lib/api/url";
import { SITIO, rutaDeProducto } from "@lib/seo/metadatos";

/**
 * El mapa del sitio, y las rutas que se le esconden al buscador.
 *
 * ── POR QUÉ ESTA LÓGICA VIVE EN `lib/` Y NO EN `app/sitemap.ts` ──
 *
 * ⚠️⚠️ Porque el runner de tests de la web SOLO mira `lib/` y `components/` (ver
 * `jest.config.js`). Mientras esto estuvo en `app/`, **era intesteable por
 * construcción**, y eso no fue un detalle académico: el 27/08 se midió en producción
 * que el mapa servía **5 URLs en vez de 34** —los 29 productos desaparecidos— y no
 * había ni una prueba que pudiera haberlo dicho antes. `app/sitemap.ts` se queda
 * siendo cuatro líneas que llaman aquí.
 *
 * ── LOS DOS FALLOS QUE TRAJERON ESTE FICHERO. LOS DOS SON EL MISMO ──
 *
 * Los dos son **una respuesta a medias leída como una respuesta completa**, que es la
 * avería de `getIdentidad` con las páginas legales (22–23/08, ver la cabecera de
 * `lib/api/url.ts`) con otro disfraz.
 *
 * **1. `[]` significaba dos cosas.** La versión anterior pedía el catálogo y, si algo
 * salía mal, devolvía `[]`. Con eso, «no pude preguntar» y «pregunté y no hay
 * productos» eran el mismo valor. Y salía más caro que en las legales, porque el
 * resultado se CACHEABA una hora: un despliegue borra la caché ISR, la primera
 * petición regenera el mapa, la API de Render está **dormida**, y el mapa amputado se
 * queda sesenta minutos diciéndole a Google que la tienda no tiene catálogo. Search
 * Console lo enseña como «Correcto», porque el XML es válido: **falla en silencio y
 * además con el sello de aprobado.**
 *
 * **2. Se pedían 200 productos y la API devuelve 50 como máximo.**
 * `productos.service.ts` hace `Math.min(50, …)` y **no avisa**: contesta 200 con
 * cincuenta artículos y un `total` que dice cuántos había de verdad. Con 29 productos
 * en catálogo no se nota nada; el día que la tienda pase de 50, el mapa dejaría de
 * listar el resto **sin un solo error**. Pedir 200 no era ambicioso, era creerse que
 * te habían dado 200.
 *
 * ⭐ LO QUE SE HACE, y el orden importa:
 *
 *   1. `null` ≠ `[]`. Es el arreglo de fondo, y es una línea.
 *   2. Se PAGINA de verdad, comparando contra el `total` que da la propia API, y si
 *      aun así falta algo se GRITA por el log.
 *   3. Se REINTENTA dentro de un PLAZO. El primer intento es justo el que DESPIERTA
 *      la API, así que es el que más probabilidades tiene de fallar; rendirse ahí es
 *      rendirse en el único intento que estaba condenado.
 *   4. Si no se pudo preguntar, el mapa sale con las rutas fijas —**nunca se lanza**,
 *      porque este fichero se prerenderiza en el build y un `throw` aquí tumbaría el
 *      despliegue entero, que ya pasó una vez con un layout— pero se grita por el
 *      log, y `revalidate` es de 5 minutos y no de una hora.
 */

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

/**
 * Cada cuánto se regenera el mapa.
 *
 * ⚠️ Eran 3600 s. Se baja a 300 porque el precio de equivocarse es asimétrico: un
 * mapa correcto que se repinta antes de tiempo no cuesta nada —lo pide un rastreador
 * cada muchas horas, y la regeneración solo ocurre cuando alguien lo pide—, mientras
 * que un mapa amputado y cacheado es una hora contándole a Google que no hay tienda.
 *
 * ⚠️ El literal de `app/sitemap.ts` tiene que coincidir con esto. Next obliga a que
 * `revalidate` sea analizable estáticamente, así que la duplicación es forzada — y
 * por eso hay un test que la vigila.
 */
export const REVALIDAR_S = 300;

/**
 * Rutas cerradas al rastreo, en orden de importancia.
 *
 * ⚠️⚠️ VIVEN AQUÍ Y NO EN `app/robots.ts` PORQUE LAS NECESITAN LOS DOS FICHEROS:
 * `robots.txt` para prohibirlas y el mapa para no anunciarlas. Anunciar en el mapa lo
 * que se prohíbe rastrear es contradecirse —Search Console lo marca como aviso, y con
 * razón—, y hasta hoy la única defensa contra eso era un comentario en prosa dentro
 * de `sitemap.ts` que decía «NO van /carrito, /checkout…». El mismo dato en dos
 * sitios, uno de ellos en forma de buena intención: es la piedra con la que este
 * proyecto lleva tropezando (`API_URL`, el título de la tienda). Ahora hay una lista
 * y un test que comprueba que el mapa no pisa ninguna.
 *
 * ⚠️ `/api/` no se cierra por seguridad —eso lo hacen las RLS y los guards, no un
 * fichero de texto que cualquiera lee— sino porque son respuestas JSON sin nada que
 * indexar. Y `/checkout` es el que más importa: cada entrada crea una sesión y una
 * reserva de stock.
 */
export const RUTAS_CERRADAS = [
  "/checkout",
  "/carrito",
  // Distinta para cada visitante y sin nada que indexar, igual que el carrito.
  "/favoritos",
  "/cuenta",
  "/backoffice",
  "/login",
  "/registro",
  "/api/",
  // El callback de acceso lleva el código de un solo uso en la URL.
  "/auth/",
] as const;

/** Las páginas que existen siempre, con su prioridad relativa. */
const FIJAS: ReadonlyArray<{
  ruta: string;
  frecuencia: "daily" | "yearly";
  prioridad: number;
}> = [
  { ruta: "", frecuencia: "daily", prioridad: 1 },
  { ruta: "/contacto", frecuencia: "yearly", prioridad: 0.5 },
  { ruta: "/terminos", frecuencia: "yearly", prioridad: 0.3 },
  { ruta: "/aviso-legal", frecuencia: "yearly", prioridad: 0.3 },
  { ruta: "/politica-privacidad", frecuencia: "yearly", prioridad: 0.3 },
];

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
      next: { revalidate: REVALIDAR_S },
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

export async function mapaDelSitio(opciones: Opciones = {}): Promise<MetadataRoute.Sitemap> {
  const ahora = new Date();

  const fijas: MetadataRoute.Sitemap = FIJAS.map((f) => ({
    url: `${SITIO}${f.ruta}`,
    lastModified: ahora,
    changeFrequency: f.frecuencia,
    priority: f.prioridad,
  }));

  const catalogo = await pedirCatalogo(opciones);

  /**
   * ⚠️⚠️ Y ESTE DICE LA CONSECUENCIA, que es lo que faltaba para enterarse. Lo que
   * hizo que el fallo pasara desapercibido no fue la lista vacía: fue que no dejaba
   * rastro en ningún sitio. Los dos salen en los logs de Vercel.
   */
  if (catalogo === null) {
    console.error(
      `[sitemap] El mapa sale con ${fijas.length} rutas fijas y SIN productos.`,
    );
    return fijas;
  }

  if (catalogo.total !== null && catalogo.productos.length < catalogo.total) {
    console.error(
      `[sitemap] El catálogo vino INCOMPLETO: ${catalogo.productos.length} de ` +
        `${catalogo.total} productos. El mapa va a salir corto.`,
    );
  }

  return [
    ...fijas,
    ...catalogo.productos
      // Solo lo que un cliente puede comprar. Un producto desactivado sigue
      // respondiendo su ficha, pero ofrecerlo al buscador es invitar a una visita
      // que acaba en un artículo que no está.
      .filter((p) => p.activo)
      .map((p) => ({
        url: `${SITIO}${rutaDeProducto(p)}`,
        // `updated_at` es la verdad de cuándo cambió la ficha: precio, foto o nombre.
        lastModified: p.updated_at ? new Date(p.updated_at) : ahora,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
  ];
}
