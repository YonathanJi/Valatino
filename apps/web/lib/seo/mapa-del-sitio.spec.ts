import type { Producto } from "@valatino/types";
import robots from "../../app/robots";
import { revalidate as REVALIDATE_DE_LA_RUTA } from "../../app/sitemap";
import { SITIO } from "./metadatos";
import { REVALIDAR_S, FIJAS as FIJAS_DECLARADAS, mapaDelSitio } from "./mapa-del-sitio";
/**
 * ⚠️ Estas cuatro se mudaron a `lib/productos/catalogo.ts` el 12/09, cuando las
 * páginas de categoría empezaron a necesitar el catálogo: pedirlo no es una tarea de
 * SEO. Los tests que las usan —el presupuesto del arranque en frío, la paginación,
 * los reintentos— se quedan aquí a propósito, porque lo que comprueban es que **el
 * mapa** sobrevive a una API dormida, que es el fallo que se midió el 27/08.
 */
import { CORTE_MAX_MS, ESPERA_MS, PLAZO_MS, POR_PAGINA } from "@lib/productos/catalogo";
import { RUTAS_CERRADAS, RUTAS_SIN_RASTREAR, fueraDelIndice } from "./rutas-cerradas";
import { categoriasDe } from "@lib/productos/categorias";

/**
 * ⚠️⚠️ POR QUÉ ESTE FICHERO EXISTE, Y POR QUÉ LLEGÓ TARDE.
 *
 * El 27/08 se midió en producción que `/sitemap.xml` servía **5 URLs en vez de 34**:
 * los 29 productos habían desaparecido y Search Console seguía diciendo «Correcto»,
 * porque el XML era válido. No había NI UNA prueba que pudiera haberlo dicho, y el
 * motivo era estructural: la lógica vivía en `app/sitemap.ts` y el runner de la web
 * solo mira `lib/` y `components/`. **Era intesteable por construcción.**
 *
 * Lo que se fija aquí, por orden de lo que costó:
 *
 *   1. Que «no pude preguntar» y «no hay productos» NO sean el mismo valor. Es el
 *      fallo del 27/08 y es la misma avería que dejó las legales en blanco en agosto.
 *   2. Que se REINTENTE dentro de un plazo que cubra el arranque en frío MEDIDO.
 *   3. Que el catálogo se pagine contra el `total` de la API — que recorta a 50 sin
 *      avisar— y que si falta algo se GRITE.
 *   4. Que el mapa y `robots.txt` no se contradigan.
 *
 * ⭐ El silencio es el enemigo en las cuatro. Un mapa corto no da error: da un 200.
 */

// ── Andamiaje ────────────────────────────────────────────────────────────────

type Respuesta = { ok: false } | { ok: true; cuerpo: unknown };

/**
 * Sirve las respuestas en orden. **La última se repite** para poder decir «y a
 * partir de aquí siempre falla» sin escribirlo N veces.
 */
function servir(...respuestas: Respuesta[]) {
  const cola = [...respuestas];
  // La firma va declarada para poder leer `mock.calls[n][0]` con tipos.
  const falso = jest.fn(async (_url: string, _init?: unknown) => {
    const r = cola.length > 1 ? (cola.shift() as Respuesta) : cola[0];
    return {
      ok: r.ok,
      status: r.ok ? 200 : 503,
      json: async () => (r.ok ? r.cuerpo : {}),
    } as unknown as Response;
  });
  global.fetch = falso as unknown as typeof fetch;
  return falso;
}

function producto(n: number, extra: Partial<Producto> = {}): Producto {
  return {
    id: `0000-${n}`,
    nombre: `Producto ${n}`,
    slug: `producto-${n}`,
    descripcion: "",
    precio: 1,
    imagenes: [],
    categoria: "Dulces",
    stock_disponible: 5,
    stock_reservado: 0,
    activo: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    iva_pct: 10,
    ...extra,
  } as unknown as Producto;
}

const pagina = (productos: Producto[], total: number | null) =>
  ({ ok: true, cuerpo: total === null ? productos : { data: productos, total } }) as Respuesta;

/**
 * Cuántas rutas fijas lleva el mapa. Se cuenta de la lista de verdad en vez de
 * escribir un 5: así, el día que se añada una página fija, estos tests siguen
 * diciendo la verdad en vez de fallar por un número que se quedó viejo.
 */
const FIJAS = FIJAS_DECLARADAS.length;

/**
 * Sin esperas y con un plazo de milisegundos: lo que se prueba es que REINTENTA y que
 * el plazo lo acota, no cuántos segundos duerme. Con los valores de producción este
 * fichero tardaría cincuenta segundos de reloj.
 */
const RAPIDO = { esperaMs: 0, plazoMs: 150 };

/**
 * Cuántas entradas de CATEGORÍA añade el mapa en estos tests.
 *
 * ⚠️ Desde el 12/09 el mapa lleva **fijas + categorías + fichas**, y aquí se cuenta el
 * total, que es justo lo que cazó el fallo del 27/08 —servía 5 URLs en vez de 34—.
 *
 * Es 1 porque `producto()` pone `categoria: "Dulces"` a todos: un catálogo de prueba
 * con productos, sea cual sea su número, produce una sola categoría. El test de abajo
 * lo comprueba en vez de darlo por supuesto, para que el día que alguien reparta los
 * productos de prueba entre categorías esto se entere.
 */
const CATEGORIAS = 1;

let gritos: jest.SpyInstance;

beforeEach(() => {
  gritos = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const urls = (m: Awaited<ReturnType<typeof mapaDelSitio>>) => m.map((e) => String(e.url));
const dichos = () => gritos.mock.calls.map((c) => String(c[0])).join(" | ");

// ── Lo normal ────────────────────────────────────────────────────────────────

describe("el mapa con la API respondiendo", () => {
  it("lleva las rutas fijas y una entrada por producto activo", async () => {
    servir(pagina([producto(1), producto(2)], 2));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 2);
    expect(urls(mapa)).toContain("https://valatino.es");
    expect(urls(mapa)).toContain("https://valatino.es/productos/producto-1");
    expect(gritos).not.toHaveBeenCalled();
  });

  it("las URLs son absolutas y van por slug", async () => {
    servir(pagina([producto(1, { slug: "nucita" })], 1));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(urls(mapa).every((u) => u.startsWith("https://valatino.es"))).toBe(true);
    expect(urls(mapa)).toContain("https://valatino.es/productos/nucita");
  });

  /** Ofrecerle al buscador algo que no se puede comprar es invitar a un 404 útil a nadie. */
  it("los desactivados se quedan fuera", async () => {
    servir(pagina([producto(1), producto(2, { activo: false })], 2));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 1);
    expect(urls(mapa)).not.toContain("https://valatino.es/productos/producto-2");
  });

  /**
   * ⚠️ Guarda el fallo #2: la API hace `Math.min(50, …)`. Pedir 200 era pedir algo
   * que no llega, y creerse que llegó.
   */
  it("pide 50 por página, que es lo que la API concede de verdad", async () => {
    const falso = servir(pagina([producto(1)], 1));

    await mapaDelSitio(RAPIDO);

    expect(String(falso.mock.calls[0][0])).toContain(`limit=${POR_PAGINA}`);
    expect(POR_PAGINA).toBeLessThanOrEqual(50);
  });
});

// ── El fallo del 27/08 ───────────────────────────────────────────────────────

describe("⭐⭐ la API dormida — el fallo medido el 27/08", () => {
  /**
   * ⭐⭐ ESTE ES EL TEST QUE HABRÍA CAZADO EL FALLO. Render contesta un 503 rápido
   * mientras arranca; la versión vieja lo leía como «el catálogo está vacío» y
   * cacheaba un mapa sin productos durante una hora.
   */
  it("un 503 en el primer intento NO significa «no hay productos»: reintenta y los trae", async () => {
    const falso = servir({ ok: false }, pagina([producto(1), producto(2)], 2));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 2);
    expect(urls(mapa)).toContain("https://valatino.es/productos/producto-1");
    expect(falso).toHaveBeenCalledTimes(2);
  });

  it("reintenta también cuando el fetch revienta, no solo cuando responde mal", async () => {
    let primera = true;
    global.fetch = jest.fn(async () => {
      if (primera) {
        primera = false;
        throw new Error("ECONNREFUSED");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [producto(1)], total: 1 }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 1);
  });

  /**
   * ⚠️ El plazo es lo que impide que esto se quede girando para siempre — antes era un
   * contador de intentos, y el contador es justo lo que no sabía cubrir un arranque
   * en frío de 42 s.
   */
  it("no insiste para siempre: se rinde cuando se agota el plazo", async () => {
    const falso = servir({ ok: false });
    const desde = Date.now();

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS);
    // Reintentó de verdad, no se rindió en el primero…
    expect(falso.mock.calls.length).toBeGreaterThan(1);
    // …y el plazo lo acotó, no se colgó.
    expect(Date.now() - desde).toBeLessThan(3_000);
  });

  /**
   * ⚠️⚠️ Y AQUÍ NO PUEDE LANZAR. Este mapa se prerenderiza en el build, así que un
   * `throw` no sería un sitemap roto: sería el despliegue de la tienda entera. Ya
   * pasó una vez con un layout que llamaba a la API (ver `(storefront)/layout.tsx`).
   */
  it("si no se pudo preguntar, sale con las fijas y NO lanza", async () => {
    servir({ ok: false });

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS);
    expect(urls(mapa)).toContain("https://valatino.es");
  });

  /**
   * ⭐ Dos gritos y no uno, a propósito: uno dice que la API no contestó **y cuántos
   * intentos hicieron falta** —«1 intento» es que retuvo la petición, «14» que
   * contestaba rápido y mal, y son averías distintas—, y el otro la consecuencia
   * para el mapa.
   */
  it("pero lo GRITA por el log: la causa y la consecuencia", async () => {
    servir({ ok: false });

    await mapaDelSitio(RAPIDO);

    expect(gritos).toHaveBeenCalledTimes(2);
    expect(dichos()).toMatch(/no dio el catálogo/);
    expect(dichos()).toMatch(/intento/);
    expect(dichos()).toMatch(/SIN productos/);
  });

  /**
   * ⭐ LA OTRA CARA, Y ES LA QUE DEMUESTRA QUE `null` NO ES `[]`: una tienda sin
   * catálogo es una respuesta legítima. No se reintenta y no se grita.
   */
  it("un catálogo vacío DE VERDAD no se confunde con un fallo", async () => {
    const falso = servir(pagina([], 0));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS);
    expect(falso).toHaveBeenCalledTimes(1);
    expect(gritos).not.toHaveBeenCalled();
  });

  /** Un 200 con un cuerpo que no trae lista tampoco es una respuesta. */
  it("un 200 con un cuerpo raro se trata como «no se pudo»", async () => {
    const falso = servir({ ok: true, cuerpo: { mensaje: "vaya" } });

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS);
    expect(falso.mock.calls.length).toBeGreaterThan(1);
    expect(gritos).toHaveBeenCalled();
  });
});

// ── El arranque en frío medido, que es lo que dimensiona el plazo ─────────────

/**
 * ⭐⭐ ESTE BLOQUE FIJA UNA MEDICIÓN, NO UN GUSTO. El 28/08 se midió un arranque en
 * frío de la API de **42,5 s**. La primera versión de este fichero se dimensionó con
 * el número que había escrito en ESTADO.md —8–16 s— y le salió un techo de 35 s, o
 * sea **insuficiente para lo que de verdad pasa**.
 *
 * Si alguien vuelve a bajar el plazo por debajo de lo medido, o alarga tanto un
 * intento que no quede sitio para reintentar, estos tres se ponen rojos.
 */
describe("⭐ el presupuesto cubre el arranque en frío que se midió", () => {
  /** Medido el 28/08 con `/health`, que no toca la base. */
  const ARRANQUE_EN_FRIO_MEDIDO_MS = 42_500;

  it("el plazo total cubre los 42,5 s medidos", () => {
    expect(PLAZO_MS).toBeGreaterThan(ARRANQUE_EN_FRIO_MEDIDO_MS);
  });

  /**
   * ⚠️ Y cabe en el límite de 60 s de generación estática de Next, que es el que
   * manda en el build — y el build es donde se cuece el mapa que se despliega.
   * Pasarse de ahí no daría un mapa corto: tumbaría el despliegue.
   */
  it("y cabe en el límite de generación estática de Next", () => {
    expect(PLAZO_MS).toBeLessThan(60_000);
  });

  /**
   * ⚠️⚠️ EL QUE DE VERDAD GUARDA ALGO. Render falla de dos formas: retiene la petición
   * (hace falta esperar) o contesta un 502/503 rápido (hace falta reintentar). Si un
   * intento pudiera consumir el plazo entero, el segundo modo se quedaría sin cubrir.
   */
  it("y siempre queda sitio para un segundo intento", () => {
    expect(CORTE_MAX_MS + ESPERA_MS).toBeLessThan(PLAZO_MS);
  });
});

// ── El fallo #2: el tope de 50 ───────────────────────────────────────────────

describe("⭐ el catálogo que no cabe en una página", () => {
  it("pagina hasta juntar el total que declara la propia API", async () => {
    const falso = servir(
      pagina([producto(1), producto(2)], 3),
      pagina([producto(3)], 3),
    );

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 3);
    expect(String(falso.mock.calls[0][0])).toContain("page=1");
    expect(String(falso.mock.calls[1][0])).toContain("page=2");
    expect(gritos).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ Cincuenta fichas valen más que ninguna, así que no se tira lo traído — pero
   * salir corto en silencio es justo el pecado que se está arreglando.
   */
  it("si una página intermedia falla, conserva lo traído y AVISA de que va corto", async () => {
    servir(pagina([producto(1), producto(2)], 3), { ok: false });

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 2);
    expect(dichos()).toMatch(/INCOMPLETO/);
    expect(dichos()).toMatch(/2 de 3/);
  });

  it("sin `total` en la respuesta se queda con lo que vino, sin inventar páginas", async () => {
    const falso = servir(pagina([producto(1), producto(2)], null));

    const mapa = await mapaDelSitio(RAPIDO);

    expect(mapa).toHaveLength(FIJAS + CATEGORIAS + 2);
    expect(falso).toHaveBeenCalledTimes(1);
    expect(gritos).not.toHaveBeenCalled();
  });
});

// ── El mapa y robots.txt, que tienen que decir lo mismo ──────────────────────

describe("el mapa y robots.txt no se contradicen", () => {
  /**
   * ⚠️⚠️ Anunciar en el mapa lo que `robots.txt` prohíbe es contradecirse, y Search
   * Console lo marca como aviso. Antes la única defensa era un comentario en prosa.
   */
  it("el mapa no anuncia NINGUNA de las rutas cerradas", async () => {
    servir(pagina([producto(1)], 1));

    const rutas = urls(await mapaDelSitio(RAPIDO)).map((u) => u.replace(SITIO, ""));

    // TODAS, incluidas las que desde el 12/09 sí se dejan rastrear: que Google
    // pueda entrar a leer el `noindex` no es motivo para invitarle en el mapa.
    for (const cerrada of RUTAS_CERRADAS) {
      expect(rutas.some((r) => r.startsWith(cerrada.ruta))).toBe(false);
    }
  });

  /**
   * ⚠️ Antes era «prohíbe exactamente la lista». Desde el 12/09 la lista tiene dos
   * grupos y `robots.txt` solo refleja uno: las cuatro pantallas públicas se dejan
   * rastrear **a propósito**, porque para leer un `noindex` hay que poder entrar.
   */
  it("robots.txt prohíbe exactamente las que tienen el rastreo prohibido", () => {
    const regla = robots().rules;
    const primera = Array.isArray(regla) ? regla[0] : regla;

    expect(primera.disallow).toEqual([...RUTAS_SIN_RASTREAR]);
    expect(primera.allow).toBe("/");
  });

  /**
   * ⭐⭐ EL TEST QUE PROTEGE EL PASO 2 DEL INFORME. Dejar de prohibir una ruta solo
   * es correcto si esa ruta sigue llevando `noindex`: si no, retirarla del
   * `Disallow` la convierte en indexable de verdad — lo contrario de lo que se
   * quería. Aquí es cierto por construcción (salen de la misma lista), y esto lo
   * fija por si alguien separa las dos cosas algún día.
   */
  it("toda ruta que se deja rastrear sigue llevando noindex", () => {
    const rastreables = RUTAS_CERRADAS.filter((r) => r.rastreo === "permitido");

    expect(rastreables.map((r) => r.ruta)).toEqual([
      "/carrito",
      "/favoritos",
      "/login",
      "/registro",
    ]);
    for (const r of rastreables) {
      expect(fueraDelIndice(r.ruta)).toBe(true);
      expect(RUTAS_SIN_RASTREAR).not.toContain(r.ruta);
    }
  });

  /** El checkout se queda cerrado: cada visita crea una reserva de stock. */
  it("/checkout NO se deja rastrear, aunque sea público", () => {
    expect(RUTAS_SIN_RASTREAR).toContain("/checkout");
    expect(fueraDelIndice("/checkout")).toBe(true);
  });

  /** Si el mapa se anunciara en otro dominio, Search Console no lo aceptaría. */
  it("robots.txt anuncia el mapa en el dominio de la tienda", () => {
    expect(robots().sitemap).toBe(`${SITIO}/sitemap.xml`);
    expect(robots().host).toBe(SITIO);
  });
});

// ── La duplicación que obliga Next ───────────────────────────────────────────

/**
 * ⭐⭐ Next exige que `revalidate` sea analizable estáticamente, así que el número
 * TIENE que estar escrito a mano en `app/sitemap.ts`. Es el mismo dato en dos sitios
 * —lo que este proyecto tiene prohibido— y como la duplicación no se puede evitar, se
 * hace lo segundo mejor: se vigila. Este test es toda la diferencia entre una
 * duplicación consciente y una que se olvida.
 */
describe("la duplicación que Next obliga", () => {
  it("el `revalidate` de la ruta coincide con REVALIDAR_S", () => {
    expect(REVALIDATE_DE_LA_RUTA).toBe(REVALIDAR_S);
  });

  it("y no vuelve a ser una hora, que era el problema", () => {
    expect(REVALIDAR_S).toBeLessThanOrEqual(600);
  });
});

// ── El `lastmod`, que decía la hora de generación ─────────────────────────────

/**
 * ⚠️⚠️ LO QUE ESTABA ROTO Y NINGUNO DE LOS 22 TESTS DE ARRIBA VEÍA. Las cinco rutas
 * fijas salían con `lastModified: new Date()`, o sea la hora de cocinar el XML, y el
 * mapa se regenera cada 5 minutos: a Google se le contaba que el aviso legal se
 * reescribe varias veces por hora. Lo cazó la auditoría SEO del 09/09, no el código.
 *
 * ⭐ Y la lección de por qué se escapó: los tests de arriba comprobaban **qué URLs**
 * salen y **cuántas**, que es lo que falló el 27/08. Nadie miró lo que cada entrada
 * DICE de sí misma. Un mapa con las 34 URLs correctas y las fechas mintiendo pasaba
 * los 22 tests en verde.
 *
 * El primero es el criterio de aceptación que pedía la auditoría, palabra por palabra:
 * «dos descargas consecutivas del sitemap sin cambios de contenido devuelven el mismo
 * lastmod para las URLs fijas».
 */
describe("⭐⭐ el lastmod de las fijas — el fallo del 09/09", () => {
  const fija = (mapa: Awaited<ReturnType<typeof mapaDelSitio>>, ruta: string) =>
    mapa.find((e) => String(e.url) === `${SITIO}${ruta}`);

  /**
   * ⚠️⚠️ ESTE TEST EMPEZÓ SIENDO «dos mapas seguidos declaran la misma fecha», que
   * es la frase del criterio de aceptación — y **pasaba en verde con el fallo
   * puesto**. El motivo merece quedar escrito porque es una trampa reutilizable:
   * `String(new Date())` se queda en los segundos, así que dos mapas generados en el
   * mismo segundo daban el mismo texto y el test se daba por satisfecho. Se vio al
   * comprobar que fallara; solo 4 de los 8 de este bloque fallaban.
   *
   * ⭐ Lo que sí muerde es afirmar el valor EXACTO contra el dato declarado. Se
   * compara contra `FIJAS` y no contra fechas escritas aquí a propósito: así el test
   * prueba el mecanismo y no el dato, y editar una legal de verdad —tocando su
   * fecha, como manda la nota de `FIJAS`— no rompe nada.
   */
  it("cada fija declara EXACTAMENTE la fecha que tiene escrita, no la del reloj", async () => {
    servir(pagina([producto(1)], 1));
    const mapa = await mapaDelSitio(RAPIDO);

    const editadas = FIJAS_DECLARADAS.filter((f) => f.ruta !== "");
    expect(editadas).toHaveLength(4);

    for (const f of editadas) {
      expect(new Date(String(fija(mapa, f.ruta)?.lastModified)).toISOString()).toBe(
        `${f.editada}T00:00:00.000Z`,
      );
    }
  });

  it("ninguna fija declara la fecha de HOY, que era el síntoma", async () => {
    servir(pagina([producto(1)], 1));
    const mapa = await mapaDelSitio(RAPIDO);
    const hoy = new Date().toISOString().slice(0, 10);

    for (const ruta of ["/contacto", "/terminos", "/aviso-legal", "/politica-privacidad"]) {
      const declarada = new Date(String(fija(mapa, ruta)?.lastModified));
      expect(declarada.toISOString().slice(0, 10)).not.toBe(hoy);
    }
  });

  /**
   * La portada es la única fija que no la edita una persona: lista el catálogo. Su
   * fecha es la más reciente entre su código y el último producto que cambió.
   */
  it("la portada sigue al catálogo cuando un producto es más nuevo que su código", async () => {
    servir(pagina([producto(1, { updated_at: "2026-09-10T08:00:00Z" })], 1));

    const portada = fija(await mapaDelSitio(RAPIDO), "");

    expect(new Date(String(portada?.lastModified)).toISOString()).toBe(
      "2026-09-10T08:00:00.000Z",
    );
  });

  /**
   * ⚠️ La primera versión de este test comprobaba «el año es 2026 y la fecha no
   * contiene 09-10», y **pasaba en verde con el fallo puesto**: la hora de generación
   * también cumple las dos cosas. Afirmar el valor exacto es lo único que muerde. Es
   * la misma lección que el test de las dos descargas, dos veces en el mismo bloque.
   */
  it("un producto DESACTIVADO no mueve la fecha de la portada", async () => {
    servir(pagina([producto(1, { activo: false, updated_at: "2026-09-10T08:00:00Z" })], 1));

    const portada = fija(await mapaDelSitio(RAPIDO), "");
    const delCodigo = FIJAS_DECLARADAS.find((f) => f.ruta === "")?.editada;

    expect(new Date(String(portada?.lastModified)).toISOString()).toBe(
      `${delCodigo}T00:00:00.000Z`,
    );
  });

  /**
   * ⚠️⚠️ EL CASO QUE IMPORTA, y es el de siempre en este fichero: con la API dormida
   * la portada NO puede caer en «ahora». Sale la fecha de su código, que es antigua
   * pero cierta.
   */
  it("con la API caída la portada declara la fecha de su código, no la de hoy", async () => {
    servir({ ok: false });

    const portada = fija(await mapaDelSitio(RAPIDO), "");
    const hoy = new Date().toISOString().slice(0, 10);

    expect(portada).toBeDefined();
    expect(new Date(String(portada?.lastModified)).toISOString().slice(0, 10)).not.toBe(hoy);
  });

  it("una ficha sin `updated_at` OMITE el campo en vez de inventarlo", async () => {
    servir(pagina([producto(1, { updated_at: undefined as unknown as string })], 1));

    const mapa = await mapaDelSitio(RAPIDO);
    const ficha = mapa.find((e) => String(e.url).includes("/productos/"));

    expect(ficha).toBeDefined();
    expect(ficha?.lastModified).toBeUndefined();
  });

  it("las fichas sí llevan su propio `updated_at`, que es la fecha de verdad", async () => {
    servir(pagina([producto(1, { updated_at: "2026-07-04T10:30:00Z" })], 1));

    const mapa = await mapaDelSitio(RAPIDO);
    const ficha = mapa.find((e) => String(e.url).includes("/productos/"));

    expect(new Date(String(ficha?.lastModified)).toISOString()).toBe("2026-07-04T10:30:00.000Z");
  });

  /** Una fecha en el futuro solo puede ser un dedazo al teclear el literal. */
  it("ninguna fecha declarada está en el futuro", async () => {
    servir(pagina([producto(1)], 1));
    const mapa = await mapaDelSitio(RAPIDO);
    const manana = Date.now() + 24 * 60 * 60 * 1000;

    for (const entrada of mapa) {
      if (!entrada.lastModified) continue;
      expect(new Date(String(entrada.lastModified)).getTime()).toBeLessThan(manana);
    }
  });
});

// ── Las categorías en el mapa ────────────────────────────────────────────────

/**
 * ⭐ Las categorías entran en el mapa desde el 12/09, y el motivo está medido: de las
 * 34 URLs, Google tenía **21 indexadas y 13 sin rastrear siquiera**. Las categorías
 * son caminos internos cortos hacia esas fichas, y anunciarlas en el mapa es la otra
 * mitad — le dice a Google que existen sin esperar a que las descubra navegando.
 */
describe("⭐ las categorías en el mapa", () => {
  /**
   * ⚠️ Comprueba la suposición sobre la que descansan las once aserciones de arriba:
   * que el `producto()` de prueba pone a todos la misma categoría. Si alguien los
   * repartiera, los totales cambiarían y este test lo dice antes de que once fallos
   * confusos manden a buscar la causa a otra parte.
   */
  it("el catálogo de prueba produce exactamente las categorías que se cuentan", () => {
    expect(categoriasDe([producto(1), producto(2), producto(3)])).toHaveLength(CATEGORIAS);
  });

  it("anuncia una URL por categoría", async () => {
    servir(
      pagina(
        [
          producto(1, { categoria: "Dulces" }),
          producto(2, { categoria: "Bebidas" }),
          producto(3, { categoria: "Dulces" }),
        ],
        3,
      ),
    );

    const rutas = urls(await mapaDelSitio(RAPIDO));

    expect(rutas).toContain("https://valatino.es/categorias/dulces");
    expect(rutas).toContain("https://valatino.es/categorias/bebidas");
    expect(rutas.filter((r) => r.includes("/categorias/"))).toHaveLength(2);
  });

  /** Una categoría que solo tiene desactivados no le sirve a nadie. */
  it("no anuncia categorías cuyos productos están todos desactivados", async () => {
    servir(
      pagina(
        [producto(1, { categoria: "Dulces" }), producto(2, { categoria: "Fantasma", activo: false })],
        2,
      ),
    );

    const rutas = urls(await mapaDelSitio(RAPIDO));

    expect(rutas).toContain("https://valatino.es/categorias/dulces");
    expect(rutas).not.toContain("https://valatino.es/categorias/fantasma");
  });

  /**
   * ⚠️ Misma regla que las fijas y las fichas: la fecha tiene que ser la de un cambio
   * real. Una categoría cambia cuando cambia lo que lista, así que hereda el
   * `updated_at` más reciente de sus productos — nunca la hora de generar el XML.
   */
  it("su lastmod es el del producto más reciente que contiene", async () => {
    servir(
      pagina(
        [
          producto(1, { categoria: "Dulces", updated_at: "2026-09-01T10:00:00Z" }),
          producto(2, { categoria: "Dulces", updated_at: "2026-09-05T10:00:00Z" }),
        ],
        2,
      ),
    );

    const mapa = await mapaDelSitio(RAPIDO);
    const cat = mapa.find((e) => String(e.url).includes("/categorias/dulces"));

    expect(new Date(String(cat?.lastModified)).toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });

  /**
   * ⚠️⚠️ Y con la API caída NO puede inventarse categorías: sin catálogo no se sabe
   * cuáles hay. El mapa sale con las fijas y nada más, que es lo que ya hacía.
   */
  it("con la API caída no anuncia ninguna categoría", async () => {
    servir({ ok: false });

    const rutas = urls(await mapaDelSitio(RAPIDO));

    expect(rutas.some((r) => r.includes("/categorias/"))).toBe(false);
  });

  /** El mapa no puede prometer lo que `robots.txt` prohíbe, ni al revés. */
  it("las categorías no están cerradas al rastreo", async () => {
    servir(pagina([producto(1)], 1));

    const rutas = urls(await mapaDelSitio(RAPIDO)).map((u) => u.replace(SITIO, ""));
    const categorias = rutas.filter((r) => r.startsWith("/categorias/"));

    expect(categorias.length).toBeGreaterThan(0);
    for (const c of categorias) {
      expect(RUTAS_CERRADAS.some((cerrada) => c.startsWith(cerrada.ruta))).toBe(false);
    }
  });
});
