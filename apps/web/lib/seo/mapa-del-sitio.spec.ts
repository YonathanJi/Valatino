import type { Producto } from "@valatino/types";
import robots from "../../app/robots";
import { revalidate as REVALIDATE_DE_LA_RUTA } from "../../app/sitemap";
import { SITIO } from "./metadatos";
import {
  INTENTOS,
  POR_PAGINA,
  REVALIDAR_S,
  RUTAS_CERRADAS,
  mapaDelSitio,
} from "./mapa-del-sitio";

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
 *   2. Que se REINTENTE, porque el primer intento es el que despierta la API.
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

const FIJAS = 5;
/** Sin espera entre intentos: lo que se prueba es que reintenta, no que duerme. */
const YA = 0;

let gritos: jest.SpyInstance;

beforeEach(() => {
  gritos = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const urls = (m: Awaited<ReturnType<typeof mapaDelSitio>>) => m.map((e) => String(e.url));

// ── Lo normal ────────────────────────────────────────────────────────────────

describe("el mapa con la API respondiendo", () => {
  it("lleva las rutas fijas y una entrada por producto activo", async () => {
    servir(pagina([producto(1), producto(2)], 2));

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 2);
    expect(urls(mapa)).toContain("https://valatino.es");
    expect(urls(mapa)).toContain("https://valatino.es/productos/producto-1");
    expect(gritos).not.toHaveBeenCalled();
  });

  it("las URLs son absolutas y van por slug", async () => {
    servir(pagina([producto(1, { slug: "nucita" })], 1));

    const mapa = await mapaDelSitio(YA);

    expect(urls(mapa).every((u) => u.startsWith("https://valatino.es"))).toBe(true);
    expect(urls(mapa)).toContain("https://valatino.es/productos/nucita");
  });

  /** Ofrecerle al buscador algo que no se puede comprar es invitar a un 404 útil a nadie. */
  it("los desactivados se quedan fuera", async () => {
    servir(pagina([producto(1), producto(2, { activo: false })], 2));

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 1);
    expect(urls(mapa)).not.toContain("https://valatino.es/productos/producto-2");
  });

  /**
   * ⚠️ Guarda el fallo #2: la API hace `Math.min(50, …)`. Pedir 200 era pedir algo
   * que no llega, y creerse que llegó.
   */
  it("pide 50 por página, que es lo que la API concede de verdad", async () => {
    const falso = servir(pagina([producto(1)], 1));

    await mapaDelSitio(YA);

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

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 2);
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

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 1);
  });

  it("no insiste para siempre: se rinde tras los intentos previstos", async () => {
    const falso = servir({ ok: false });

    await mapaDelSitio(YA);

    expect(falso).toHaveBeenCalledTimes(INTENTOS);
  });

  /**
   * ⚠️⚠️ Y AQUÍ NO PUEDE LANZAR. Este mapa se prerenderiza en el build, así que un
   * `throw` no sería un sitemap roto: sería el despliegue de la tienda entera. Ya
   * pasó una vez con un layout que llamaba a la API (ver `(storefront)/layout.tsx`).
   */
  it("si no se pudo preguntar, sale con las fijas y NO lanza", async () => {
    servir({ ok: false });

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS);
    expect(urls(mapa)).toContain("https://valatino.es");
  });

  it("pero lo GRITA por el log, que es lo que faltaba para enterarse", async () => {
    servir({ ok: false });

    await mapaDelSitio(YA);

    expect(gritos).toHaveBeenCalledTimes(1);
    expect(String(gritos.mock.calls[0][0])).toMatch(/sitemap/i);
    expect(String(gritos.mock.calls[0][0])).toMatch(/SIN productos/);
  });

  /**
   * ⭐ LA OTRA CARA, Y ES LA QUE DEMUESTRA QUE `null` NO ES `[]`: una tienda sin
   * catálogo es una respuesta legítima. No se reintenta y no se grita.
   */
  it("un catálogo vacío DE VERDAD no se confunde con un fallo", async () => {
    const falso = servir(pagina([], 0));

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS);
    expect(falso).toHaveBeenCalledTimes(1);
    expect(gritos).not.toHaveBeenCalled();
  });

  /** Un 200 con un cuerpo que no trae lista tampoco es una respuesta. */
  it("un 200 con un cuerpo raro se trata como «no se pudo»", async () => {
    const falso = servir({ ok: true, cuerpo: { mensaje: "vaya" } });

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS);
    expect(falso).toHaveBeenCalledTimes(INTENTOS);
    expect(gritos).toHaveBeenCalled();
  });
});

// ── El fallo #2: el tope de 50 ───────────────────────────────────────────────

describe("⭐ el catálogo que no cabe en una página", () => {
  it("pagina hasta juntar el total que declara la propia API", async () => {
    const falso = servir(
      pagina([producto(1), producto(2)], 3),
      pagina([producto(3)], 3),
    );

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 3);
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

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 2);
    expect(String(gritos.mock.calls[0][0])).toMatch(/INCOMPLETO/);
    expect(String(gritos.mock.calls[0][0])).toMatch(/2 de 3/);
  });

  it("sin `total` en la respuesta se queda con lo que vino, sin inventar páginas", async () => {
    const falso = servir(pagina([producto(1), producto(2)], null));

    const mapa = await mapaDelSitio(YA);

    expect(mapa).toHaveLength(FIJAS + 2);
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

    const rutas = urls(await mapaDelSitio(YA)).map((u) => u.replace(SITIO, ""));

    for (const cerrada of RUTAS_CERRADAS) {
      expect(rutas.some((r) => r.startsWith(cerrada))).toBe(false);
    }
  });

  it("robots.txt prohíbe exactamente la lista compartida", () => {
    const regla = robots().rules;
    const primera = Array.isArray(regla) ? regla[0] : regla;

    expect(primera.disallow).toEqual([...RUTAS_CERRADAS]);
    expect(primera.allow).toBe("/");
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
