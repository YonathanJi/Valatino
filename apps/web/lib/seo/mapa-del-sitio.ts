import type { MetadataRoute } from "next";
import type { Producto } from "@valatino/types";
import { pedirCatalogo, type Opciones } from "@lib/productos/catalogo";
import { categoriasDe, rutaDeCategoria } from "@lib/productos/categorias";
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
 * Las páginas que existen siempre, con su prioridad relativa y **la fecha real en
 * que se editaron**.
 *
 * ── POR QUÉ HAY UNA FECHA ESCRITA A MANO AQUÍ ──
 *
 * ⚠️⚠️ Hasta el 11/09 las cinco salían con `lastModified: new Date()`, o sea **la
 * hora de generar el mapa**. Lo detectó la auditoría SEO del 09/09 y tiene razón en
 * el fondo del asunto: `lastmod` no significa «cuándo se hizo este XML», significa
 * «cuándo cambió esta página». Como el mapa se regenera cada 5 minutos, a Google se
 * le estaba diciendo que el aviso legal se reescribe varias veces por hora. Una
 * señal que siempre grita deja de ser una señal: Google aprende a no creérsela, y
 * entonces tampoco se cree el `lastmod` de las fichas de producto, que **sí es
 * verdad** y es el que interesa que mire.
 *
 * ⭐ Las fechas salen de `git log -1 --format=%ad -- <fichero>`, o sea de cuándo se
 * tocó de verdad cada página. No se leen de git en tiempo de build **a propósito**:
 * Vercel clona con `--depth=1` y ahí el historial de un fichero no existe, así que
 * eso fallaría precisamente en el único sitio donde importa.
 *
 * ⚠️ **AL EDITAR UNA DE ESTAS PÁGINAS, HAY QUE TOCAR SU FECHA.** Es el mismo dato
 * en dos sitios y no me gusta, pero la alternativa —deducirla— no es fiable en
 * build. El olvido es inocuo en la dirección segura: el mapa diría que la página es
 * más antigua de lo que es, lo que a lo sumo retrasa una revisita. Lo que no puede
 * volver a pasar es lo contrario, que es lo que pasaba.
 */
export const FIJAS: ReadonlyArray<{
  ruta: string;
  frecuencia: "daily" | "yearly";
  prioridad: number;
  /**
   * Fecha ISO (`AAAA-MM-DD`) de la última edición del contenido. **Nunca la hora de
   * generación.** Hay un test que comprueba que ninguna es de hoy por accidente.
   */
  editada: string;
}> = [
  { ruta: "", frecuencia: "daily", prioridad: 1, editada: "2026-08-20" },
  { ruta: "/contacto", frecuencia: "yearly", prioridad: 0.5, editada: "2026-08-26" },
  { ruta: "/terminos", frecuencia: "yearly", prioridad: 0.3, editada: "2026-08-26" },
  { ruta: "/aviso-legal", frecuencia: "yearly", prioridad: 0.3, editada: "2026-08-26" },
  {
    ruta: "/politica-privacidad",
    frecuencia: "yearly",
    prioridad: 0.3,
    editada: "2026-08-26",
  },
];

/**
 * La portada, que es la única de las fijas que **no la edita una persona**: lista el
 * catálogo, así que cambia cuando cambia un producto.
 *
 * ⭐ Se toma la MÁS RECIENTE entre la fecha de su código y el último `updated_at`
 * del catálogo. Así la fecha es verdad en los dos casos y —esto es lo que importa—
 * **cuando la API no contesta no se cae en `ahora`**: sale la fecha del código, que
 * es antigua pero cierta. Es la misma regla que el resto del fichero: una respuesta
 * a medias no se disfraza de respuesta completa.
 */
export function editadaLaPortada(productos: Producto[], editada: string): Date {
  const delCodigo = new Date(`${editada}T00:00:00Z`);

  let masReciente = delCodigo;
  for (const p of productos) {
    if (!p.activo || !p.updated_at) continue;
    const cambio = new Date(p.updated_at);
    if (!Number.isNaN(cambio.getTime()) && cambio > masReciente) masReciente = cambio;
  }
  return masReciente;
}



export async function mapaDelSitio(opciones: Opciones = {}): Promise<MetadataRoute.Sitemap> {
  const catalogo = await pedirCatalogo(opciones);

  /**
   * ⚠️ El catálogo se pide ANTES de formar las fijas, y el orden no es casual: la
   * portada necesita saber cuándo cambió el catálogo para declarar su fecha (ver
   * `editadaLaPortada`). Antes las fijas se formaban primero porque todas usaban la
   * misma hora de reloj.
   */
  const fijas: MetadataRoute.Sitemap = FIJAS.map((f) => ({
    url: `${SITIO}${f.ruta}`,
    lastModified:
      f.ruta === ""
        ? editadaLaPortada(catalogo?.productos ?? [], f.editada)
        : new Date(`${f.editada}T00:00:00Z`),
    changeFrequency: f.frecuencia,
    priority: f.prioridad,
  }));

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

  /**
   * Las categorías, que salen del propio catálogo y no de una lista escrita.
   *
   * ⭐ Se deducen de los productos, así que una categoría nueva entra en el mapa
   * **sola**, el mismo día que se le pone a un producto. Si estuvieran escritas aquí,
   * habría que acordarse — y nadie se acuerda.
   *
   * ⚠️ Su `lastmod` es el del producto más reciente que contienen, por lo mismo que
   * la portada: una página que lista cosas cambia cuando cambian las cosas que lista.
   * Sin esto habría que inventar una fecha, y la hora de generación es justo lo que
   * se quitó de las fijas el 11/09.
   */
  const categorias: MetadataRoute.Sitemap = categoriasDe(catalogo.productos).map((c) => ({
    url: `${SITIO}${rutaDeCategoria(c.slug)}`,
    lastModified: editadaLaPortada(c.productos, FIJAS[0]!.editada),
    changeFrequency: "weekly" as const,
    // Por debajo de la portada (1) y por encima de las fichas (0,8): una categoría
    // es la puerta a varias, no un destino final.
    priority: 0.9,
  }));

  return [
    ...fijas,
    ...categorias,
    ...catalogo.productos
      // Solo lo que un cliente puede comprar. Un producto desactivado sigue
      // respondiendo su ficha, pero ofrecerlo al buscador es invitar a una visita
      // que acaba en un artículo que no está.
      .filter((p) => p.activo)
      .map((p) => ({
        url: `${SITIO}${rutaDeProducto(p)}`,
        /**
         * `updated_at` es la verdad de cuándo cambió la ficha: precio, foto o
         * nombre.
         *
         * ⚠️ Si no viene, el campo **se omite** en vez de poner la hora de ahora.
         * `lastmod` es opcional en el protocolo, así que callarse es una respuesta
         * válida — y decir «cambió hace un segundo» de una ficha de la que no se
         * sabe nada es la misma mentira que las fijas llevaban contando, solo que
         * de una en una.
         */
        ...(p.updated_at ? { lastModified: new Date(p.updated_at) } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
  ];
}
