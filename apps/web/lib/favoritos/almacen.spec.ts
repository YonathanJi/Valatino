import { TOPE_FAVORITOS } from "@valatino/types";
import { CLAVE, alternar, escribir, estaLleno, leer, normalizar, unir } from "./almacen";

/**
 * ⚠️⚠️ POR QUÉ SE PRUEBA ESTO Y NO EL COMPONENTE: el runner de la web corre en `node`
 * sin `jsdom` ni `@testing-library/react` (ver `jest.config.js`), así que un `.tsx`
 * no se puede montar. Lo que puede estar mal vive aquí. Es la misma regla que trajo
 * `lib/seo/mapa-del-sitio.ts` el 27/08, después de descubrir que el mapa era
 * intesteable por construcción y llevaba días sirviendo 5 URL en vez de 34.
 *
 * Lo que se fija, por orden de lo que costaría:
 *
 *   1. Que al iniciar sesión las dos listas se UNAN y no se reemplacen.
 *   2. Que un `localStorage` roto, bloqueado o con basura **no rompa la tienda**.
 *   3. Que el tope se respete de verdad.
 */

/** Un `localStorage` de mentira, con la opción de que reviente como en modo privado. */
function montarAlmacen(opciones: { revienta?: boolean; contenido?: string } = {}) {
  const { revienta = false, contenido } = opciones;
  const datos = new Map<string, string>();
  if (contenido !== undefined) datos.set(CLAVE, contenido);

  const almacen = {
    getItem: (k: string) => {
      if (revienta) throw new Error("SecurityError: acceso denegado");
      return datos.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (revienta) throw new Error("QuotaExceededError");
      datos.set(k, v);
    },
  };

  (globalThis as { window?: unknown }).window = { localStorage: almacen };
  return datos;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

// ── Lo que llega del almacén no es de fiar ───────────────────────────────────

describe("normalizar", () => {
  it("deja pasar una lista de textos", () => {
    expect(normalizar(["a", "b"])).toEqual(["a", "b"]);
  });

  /** Lo escribió otra versión de la tienda, o alguien desde la consola. */
  it("lo que no es una lista se queda en nada", () => {
    expect(normalizar({ a: 1 })).toEqual([]);
    expect(normalizar("a,b")).toEqual([]);
    expect(normalizar(null)).toEqual([]);
  });

  it("quita lo que no sea texto y los vacíos", () => {
    expect(normalizar(["a", 3, null, "", { x: 1 }, "b"])).toEqual(["a", "b"]);
  });

  it("quita repetidos", () => {
    expect(normalizar(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("aplica el tope", () => {
    const muchos = Array.from({ length: TOPE_FAVORITOS + 40 }, (_, i) => `p${i}`);
    expect(normalizar(muchos)).toHaveLength(TOPE_FAVORITOS);
  });
});

// ── El almacén de verdad, que puede fallar ───────────────────────────────────

describe("leer", () => {
  it("devuelve lo guardado", () => {
    montarAlmacen({ contenido: JSON.stringify(["a", "b"]) });
    expect(leer()).toEqual(["a", "b"]);
  });

  it("sin nada guardado, lista vacía", () => {
    montarAlmacen();
    expect(leer()).toEqual([]);
  });

  /** ⭐ Un JSON roto no puede tumbar el catálogo entero. */
  it("con el contenido corrupto no lanza: devuelve vacío", () => {
    montarAlmacen({ contenido: "{{{ esto no es json" });
    expect(() => leer()).not.toThrow();
    expect(leer()).toEqual([]);
  });

  /**
   * ⚠️⚠️ EN MODO PRIVADO HAY NAVEGADORES QUE LANZAN AL TOCAR `localStorage`, no solo
   * al leerlo. Si esto no estuviera envuelto, la tienda se caería para quien navega
   * en privado — que es bastante gente y no lo va a reportar: se va.
   */
  it("con el almacén bloqueado no lanza", () => {
    montarAlmacen({ revienta: true });
    expect(() => leer()).not.toThrow();
    expect(leer()).toEqual([]);
  });

  /** El primer render ocurre en el servidor, donde no hay `window`. */
  it("sin `window` (servidor) no lanza", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => leer()).not.toThrow();
    expect(leer()).toEqual([]);
  });
});

describe("escribir", () => {
  it("guarda ya normalizado", () => {
    const datos = montarAlmacen();
    escribir(["a", "a", "b"]);
    expect(JSON.parse(datos.get(CLAVE) as string)).toEqual(["a", "b"]);
  });

  it("con el almacén bloqueado no lanza y avisa de que no pudo", () => {
    montarAlmacen({ revienta: true });
    expect(() => escribir(["a"])).not.toThrow();
    expect(escribir(["a"])).toBe(false);
  });
});

// ── La unión, que es la decisión de fondo ────────────────────────────────────

describe("unir", () => {
  /**
   * ⭐⭐ ESTO ES LO QUE PIDIÓ JONATHAN: guardar sin cuenta y que al iniciar sesión no
   * se pierda. Reemplazar en cualquiera de los dos sentidos borra algo que alguien
   * guardó a propósito.
   */
  it("junta las dos listas sin perder nada de ninguna", () => {
    expect(unir(["a", "b"], ["c"])).toEqual(["a", "b", "c"]);
  });

  it("lo que está en las dos aparece una vez", () => {
    expect(unir(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("con una vacía se queda la otra entera", () => {
    expect(unir([], ["a", "b"])).toEqual(["a", "b"]);
    expect(unir(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("y el resultado tampoco se pasa del tope", () => {
    const a = Array.from({ length: TOPE_FAVORITOS }, (_, i) => `a${i}`);
    expect(unir(a, ["extra"])).toHaveLength(TOPE_FAVORITOS);
  });
});

// ── El gesto ─────────────────────────────────────────────────────────────────

describe("alternar", () => {
  it("lo que no estaba se añade, y el primero", () => {
    expect(alternar(["a"], "b")).toEqual(["b", "a"]);
  });

  it("lo que estaba se quita", () => {
    expect(alternar(["a", "b"], "a")).toEqual(["b"]);
  });

  it("dos veces seguidas deja la lista como estaba", () => {
    expect(alternar(alternar(["a"], "b"), "b")).toEqual(["a"]);
  });

  /** Al llegar al tope se cae el más viejo, no se rechaza el gesto. */
  it("lleno, entra el nuevo y se cae el más antiguo", () => {
    const llena = Array.from({ length: TOPE_FAVORITOS }, (_, i) => `p${i}`);
    const despues = alternar(llena, "nuevo");

    expect(despues).toHaveLength(TOPE_FAVORITOS);
    expect(despues[0]).toBe("nuevo");
    expect(despues).not.toContain(`p${TOPE_FAVORITOS - 1}`);
  });
});

describe("estaLleno", () => {
  it("dice que no cuando cabe más", () => {
    expect(estaLleno(["a"])).toBe(false);
  });

  it("y que sí al llegar al tope", () => {
    expect(estaLleno(Array.from({ length: TOPE_FAVORITOS }, (_, i) => `p${i}`))).toBe(true);
  });
});
