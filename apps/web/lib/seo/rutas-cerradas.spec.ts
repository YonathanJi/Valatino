import fs from "node:fs";
import path from "node:path";
import { NO_INDEXAR, RUTAS_CERRADAS, fueraDelIndice } from "./rutas-cerradas";

/**
 * ⚠️⚠️ QUÉ SE FIJA AQUÍ, Y DE QUÉ FALLO VIENE.
 *
 * La auditoría SEO del 09/09 señaló que `robots.txt` **no es una orden de no
 * indexar**: una URL bloqueada puede acabar en Google si alguien la enlaza. La
 * tienda tenía nueve rutas en el `Disallow` y **ninguna** con `noindex` (medido: cero
 * resultados de `grep noindex` en toda la web).
 *
 * ⭐ Y al ponerlo salió un décimo caso que no estaba en el informe: **`/admin`**, la
 * pantalla de acceso del personal, respondía 200 sin `Disallow` ni `noindex`. Se
 * escapó porque la lista hablaba de `/login` —los clientes— y el staff entra por
 * otra puerta. De ahí el último test de este fichero, que es el que impide que vuelva
 * a pasar: **obliga a decidir, ruta por ruta, si va al índice o no.**
 */

describe("qué queda fuera del índice", () => {
  it("las pantallas de utilidad y de acceso están todas cerradas", () => {
    for (const ruta of [
      "/carrito",
      "/favoritos",
      "/login",
      "/registro",
      "/checkout",
      "/admin",
      "/cuenta",
      "/backoffice",
    ]) {
      expect(fueraDelIndice(ruta)).toBe(true);
    }
  });

  it("lo que sí se quiere en Google no lleva noindex", () => {
    for (const ruta of [
      "/",
      "/contacto",
      "/terminos",
      "/aviso-legal",
      "/politica-privacidad",
      "/productos/nucita",
      "/productos/pony-malta",
    ]) {
      expect(fueraDelIndice(ruta)).toBe(false);
    }
  });

  /**
   * ⚠️ Compara por prefijo, igual que Google interpreta el `Disallow`. Sin esto,
   * `/checkout/confirmacion` —que lleva la referencia del pago en la URL— quedaría
   * fuera del `noindex` estando dentro del `Disallow`.
   */
  it("cubre también lo que hay DEBAJO de una ruta cerrada", () => {
    expect(fueraDelIndice("/checkout/confirmacion")).toBe(true);
    expect(fueraDelIndice("/cuenta/pedidos")).toBe(true);
    expect(fueraDelIndice("/cuenta/perfil")).toBe(true);
    expect(fueraDelIndice("/backoffice/contabilidad/iva")).toBe(true);
    expect(fueraDelIndice("/auth/callback")).toBe(true);
  });

  /**
   * ⭐ `follow` y no `nofollow`: el carrito y los favoritos enlazan a fichas de
   * producto, y esas sí interesa que se rastreen. Lo que no se quiere es que la lista
   * de la compra de alguien sea un resultado de búsqueda.
   */
  it("dice noindex pero deja seguir los enlaces al catálogo", () => {
    expect(NO_INDEXAR).toContain("noindex");
    expect(NO_INDEXAR).toContain("follow");
    expect(NO_INDEXAR).not.toContain("nofollow");
  });
});

// ── La guarda que habría cazado /admin ───────────────────────────────────────

/**
 * Las rutas públicas que SÍ se quieren en el índice de Google. Es una lista blanca
 * **escrita a mano y a propósito**: son las 6 plantillas que producen las 34 URLs del
 * mapa del sitio.
 */
const INDEXABLES = [
  "/",
  "/contacto",
  "/terminos",
  "/aviso-legal",
  "/politica-privacidad",
  "/productos/[slug]",
];

/**
 * Las rutas que la web sirve de verdad, leídas de `app/`.
 *
 * Los grupos de Next —`(storefront)`— no son segmentos de URL y se saltan; los
 * dinámicos (`[slug]`) se conservan tal cual, que es como están en `INDEXABLES`.
 */
function rutasDeApp(dir: string, base = ""): string[] {
  const rutas: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "page.tsx") rutas.push(base === "" ? "/" : base);
    if (!entrada.isDirectory()) continue;

    const esGrupo = entrada.name.startsWith("(") && entrada.name.endsWith(")");
    rutas.push(
      ...rutasDeApp(path.join(dir, entrada.name), esGrupo ? base : `${base}/${entrada.name}`),
    );
  }
  return rutas;
}

/**
 * ⚠️⚠️ ESTE ES EL TEST QUE IMPORTA DE ESTE FICHERO. No comprueba una lista: comprueba
 * que **no falte nadie en ninguna de las dos**. Cada pantalla de la tienda tiene que
 * estar o en `INDEXABLES` o cerrada al buscador, y una ruta nueva que no esté en
 * ninguna de las dos rompe esto el día que se crea — no semanas después y en Search
 * Console, que es cómo se enteró la tienda de `/admin`.
 *
 * ⭐ Falla en la dirección segura: obliga a decidir. Si alguien añade `/ofertas` y
 * quiere que Google la vea, la apunta en `INDEXABLES` y ya está; si añade
 * `/devoluciones/formulario`, la cierra. Lo que no puede hacer es no decidir.
 */
describe("⭐⭐ ninguna ruta se queda sin decidir", () => {
  const rutas = rutasDeApp(path.resolve(__dirname, "../../app"));

  it("encuentra las rutas de verdad (si esto falla, es que el recorrido se rompió)", () => {
    expect(rutas).toContain("/");
    expect(rutas).toContain("/productos/[slug]");
    expect(rutas).toContain("/admin");
    expect(rutas.length).toBeGreaterThan(30);
  });

  it("cada ruta está declarada indexable o cerrada, nunca las dos ni ninguna", () => {
    const sinDecidir = rutas.filter((r) => !INDEXABLES.includes(r) && !fueraDelIndice(r));
    const enLasDos = rutas.filter((r) => INDEXABLES.includes(r) && fueraDelIndice(r));

    expect({ sinDecidir, enLasDos }).toEqual({ sinDecidir: [], enLasDos: [] });
  });

  /** Una ruta cerrada que nadie sirve es una línea que sobra en `robots.txt`. */
  it("no se prohíben rutas que no existen", () => {
    const huerfanas = RUTAS_CERRADAS.filter(
      // `/api/` lo sirve el `rewrites()` de Next, no un `page.tsx`.
      (c) => c.ruta !== "/api/" && !rutas.some((r) => r.startsWith(c.ruta)),
    );

    expect(huerfanas).toEqual([]);
  });
});
