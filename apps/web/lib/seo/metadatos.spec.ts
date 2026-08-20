import type { Producto } from "@valatino/types";
import { formatEUR } from "@lib/utils";
import {
  DESCRIPCION_GENERICA,
  descripcionDeProducto,
  LIMITE_DESCRIPCION,
  ogDelSitio,
  ogDeProducto,
  ogImagenDeFoto,
  recortar,
  rutaDeProducto,
  SITIO,
  urlAbsoluta,
} from "./metadatos";

/**
 * Estos tests existen porque **esta lógica falla en silencio**.
 *
 * Una `og:image` mal formada no da error, no rompe la página y no sale en ningún
 * log: solo hace que al compartir el enlace por WhatsApp no aparezca la foto. Es
 * el mismo perfil de avería que los límites del multipart del 11/08, que
 * estuvieron seis días rotos porque vivían en un objeto literal que nadie
 * ejecutaba. Así que aquí se ejecuta.
 *
 * Lo que se fija, por orden de lo que cuesta si se rompe:
 *  1. que la URL de la imagen sea SIEMPRE absoluta,
 *  2. que las fotos del bucket salgan por `render/image` (WebP → JPEG),
 *  3. que NO se declaren dimensiones de las fotos de producto,
 *  4. que el precio vaya delante y el stock no aparezca.
 */

const BUCKET = "https://lxnphjwsypnjrulotiph.supabase.co";
const FOTO = `${BUCKET}/storage/v1/object/public/productos/abc-123.webp`;

let n = 0;
function prod(extra: Partial<Producto> = {}): Producto {
  n += 1;
  return {
    id: `p-${n}`,
    nombre: `Producto ${n}`,
    descripcion: null,
    precio: 4.92,
    iva_pct: 10,
    imagenes: [FOTO],
    categoria: "Bebidas",
    stock_disponible: 7,
    stock_reservado: 0,
    activo: true,
    slug: `producto-${n}`,
    familia: null,
    variante: null,
    variante_tipo: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

describe("urlAbsoluta", () => {
  it("convierte una ruta del sitio en absoluta", () => {
    expect(urlAbsoluta("/placeholder.png")).toBe(`${SITIO}/placeholder.png`);
  });

  it("le pone la barra si falta, sin duplicarla", () => {
    expect(urlAbsoluta("placeholder.png")).toBe(`${SITIO}/placeholder.png`);
  });

  it("deja intacta una URL que ya es absoluta", () => {
    expect(urlAbsoluta(FOTO)).toBe(FOTO);
  });

  it("reconoce el http y las mayúsculas como absolutos", () => {
    expect(urlAbsoluta("HTTP://ejemplo.test/a.png")).toBe("HTTP://ejemplo.test/a.png");
  });
});

describe("ogImagenDeFoto", () => {
  it("saca las fotos del bucket por render/image, que las devuelve en JPEG", () => {
    const url = ogImagenDeFoto(FOTO);
    expect(url).toContain("/storage/v1/render/image/public/productos/abc-123.webp");
    expect(url).not.toContain("/storage/v1/object/public/");
  });

  /**
   * `format=origin` es lo que hace que salga JPEG en vez de WebP. Sin él, la
   * transformación devuelve WebP y volvemos al problema de partida — que es
   * invisible, porque la URL sigue dando 200.
   */
  it("pide format=origin, resize=contain y la caja de 1200×630", () => {
    const url = ogImagenDeFoto(FOTO);
    expect(url).toContain("format=origin");
    expect(url).toContain("resize=contain");
    expect(url).toContain("width=1200");
    expect(url).toContain("height=630");
  });

  it("no recorta: contain deja el producto entero, cover lo decapita", () => {
    expect(ogImagenDeFoto(FOTO)).not.toContain("resize=cover");
  });

  it("absolutiza el placeholder de un producto sin foto, sin transformarlo", () => {
    expect(ogImagenDeFoto("/placeholder.png")).toBe(`${SITIO}/placeholder.png`);
  });

  it("siempre devuelve algo absoluto, que es lo único que WhatsApp puede pedir", () => {
    for (const entrada of [FOTO, "/placeholder.png", "placeholder.png"]) {
      expect(ogImagenDeFoto(entrada)).toMatch(/^https?:\/\//i);
    }
  });
});

describe("rutaDeProducto", () => {
  it("usa el slug cuando lo hay", () => {
    expect(rutaDeProducto({ id: "uuid-1", slug: "chocolate-corona" })).toBe(
      "/productos/chocolate-corona",
    );
  });

  it("cae al id cuando el slug falta", () => {
    expect(rutaDeProducto({ id: "uuid-1", slug: null as unknown as string })).toBe(
      "/productos/uuid-1",
    );
  });
});

describe("recortar", () => {
  it("deja el texto corto tal cual, sin puntos suspensivos", () => {
    expect(recortar("Café colombiano")).toBe("Café colombiano");
  });

  it("junta los espacios y saltos de línea en uno", () => {
    expect(recortar("Café   colombiano\n\ntostado")).toBe("Café colombiano tostado");
  });

  /**
   * ⚠️ El que separa la cifra del € en `4,92 €` es un espacio DURO (U+00A0), y
   * `\s` de JavaScript también lo casa. Si alguien vuelve a poner
   * `replace(/\s+/g, " ")`, este test se pone rojo: aplastarlo deja que WhatsApp
   * parta el precio en dos líneas, «4,92» arriba y «€» abajo.
   */
  it("NO aplasta el espacio duro del precio, que es lo que lo mantiene junto", () => {
    const duro = "\u00A0"; // espacio duro, explicito para que se vea
    expect(recortar(`4,92${duro}€ · Café`)).toContain(`4,92${duro}€`);
    expect(recortar(`4,92${duro}€ · Café`)).not.toContain("4,92 €");
  });

  it("corta por palabra entera y avisa con puntos suspensivos", () => {
    const largo = "palabra ".repeat(60).trim();
    const corto = recortar(largo, 40);
    expect(corto.length).toBeLessThanOrEqual(40);
    expect(corto.endsWith("…")).toBe(true);
    expect(corto).not.toContain("palabr…");
  });

  it("no deja un signo de puntuación colgando antes de los puntos", () => {
    expect(recortar("Café colombiano, tostado y molido", 20)).not.toMatch(/[.,;:·]…$/);
  });

  /** Una sola palabra más larga que el límite no puede cortarse por espacio. */
  it("corta a lo bruto si no hay ningún espacio donde partir", () => {
    const corto = recortar("a".repeat(50), 20);
    expect(corto.length).toBeLessThanOrEqual(20);
    expect(corto.endsWith("…")).toBe(true);
  });
});

describe("descripcionDeProducto", () => {
  it("pone el precio delante, que es lo que decide si abren el enlace", () => {
    const texto = descripcionDeProducto({ descripcion: "Café instantáneo", precio: 4.92 });
    expect(texto.startsWith(formatEUR(4.92))).toBe(true);
    expect(texto).toContain("4,92");
    expect(texto).toContain("Café instantáneo");
  });

  it("recurre al texto genérico si el producto no tiene descripción", () => {
    expect(descripcionDeProducto({ descripcion: null, precio: 1 })).toContain(
      DESCRIPCION_GENERICA,
    );
  });

  it("trata una descripción en blanco como si no hubiera", () => {
    expect(descripcionDeProducto({ descripcion: "   ", precio: 1 })).toContain(
      DESCRIPCION_GENERICA,
    );
  });

  it("no se pasa del límite aunque la descripción sea larguísima", () => {
    const texto = descripcionDeProducto({ descripcion: "muy largo ".repeat(80), precio: 4.92 });
    expect(texto.length).toBeLessThanOrEqual(LIMITE_DESCRIPCION);
  });

  it("acepta el precio como cadena, que es como lo devuelve la API", () => {
    const texto = descripcionDeProducto({
      descripcion: "x",
      precio: "4.92" as unknown as number,
    });
    expect(texto).toContain("4,92");
  });
});

describe("ogDeProducto", () => {
  it("monta la tarjeta con nombre, precio, URL de la ficha y foto transformada", () => {
    const p = prod({ nombre: "Chocolate Corona", slug: "chocolate-corona", precio: 4.92 });
    const og = ogDeProducto(p);

    expect(og.title).toBe("Chocolate Corona");
    expect(og.url).toBe(`${SITIO}/productos/chocolate-corona`);
    expect(og.siteName).toBe("Valatino");
    expect(og.locale).toBe("es_ES");
    expect(String(og.description)).toContain("4,92");

    const imagenes = og.images as { url: string; alt: string }[];
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0].url).toContain("/render/image/");
    expect(imagenes[0].alt).toBe("Chocolate Corona");
  });

  it("usa la PRIMERA foto cuando hay varias, la misma que la miniatura", () => {
    const otra = `${BUCKET}/storage/v1/object/public/productos/segunda.webp`;
    const og = ogDeProducto(prod({ imagenes: [FOTO, otra] }));
    const imagenes = og.images as { url: string }[];
    expect(imagenes[0].url).toContain("abc-123.webp");
    expect(imagenes[0].url).not.toContain("segunda.webp");
  });

  it("no se queda sin foto si el producto no tiene ninguna", () => {
    const og = ogDeProducto(prod({ imagenes: [] }));
    const imagenes = og.images as { url: string }[];
    expect(imagenes[0].url).toBe(`${SITIO}/placeholder.png`);
  });

  /**
   * ⚠️ Esto se fija a propósito para que nadie «lo mejore» añadiéndolas: la
   * proporción de salida depende de la foto de origen, así que un 1200×630 fijo
   * sería falso y descuadraría la tarjeta.
   */
  it("NO declara dimensiones de la foto del producto", () => {
    const imagenes = ogDeProducto(prod()).images as Record<string, unknown>[];
    expect(imagenes[0].width).toBeUndefined();
    expect(imagenes[0].height).toBeUndefined();
  });

  /** La tarjeta se queda en caché de WhatsApp; el stock no. */
  it("no dice nada del stock, que se quedaría pegado al enlace", () => {
    const og = ogDeProducto(prod({ stock_disponible: 0 }));
    expect(String(og.description).toLowerCase()).not.toContain("agotado");
    expect(String(og.description).toLowerCase()).not.toContain("disponible");
  });

  it("apunta a la ficha por id si el producto no tiene slug", () => {
    const og = ogDeProducto(prod({ id: "uuid-9", slug: null as unknown as string }));
    expect(og.url).toBe(`${SITIO}/productos/uuid-9`);
  });
});

describe("ogDelSitio", () => {
  it("usa la portada generada, absoluta y con sus dimensiones", () => {
    const og = ogDelSitio("Valatino", "Sabores de Latinoamérica");
    const imagenes = og.images as { url: string; width: number; height: number }[];
    expect(imagenes[0].url).toBe(`${SITIO}/portada.png`);
    expect(imagenes[0].width).toBe(1200);
    expect(imagenes[0].height).toBe(630);
  });

  /** Aquí sí se declaran: la imagen la generamos nosotros y sabemos su tamaño. */
  it("declara el tamaño de la portada porque este sí lo controlamos", () => {
    const imagenes = ogDelSitio("t", "d").images as Record<string, unknown>[];
    expect(imagenes[0].width).toBeDefined();
    expect(imagenes[0].height).toBeDefined();
  });
});
