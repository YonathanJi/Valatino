import type { IdentidadPublica, Producto } from "@valatino/types";
import {
  comercio,
  comercioConIdentidad,
  migasDeProducto,
  productoJsonLd,
  sitioWeb,
} from "./datos-estructurados";

/**
 * ⚠️⚠️ POR QUÉ ESTO SE PRUEBA, aunque «solo sean etiquetas».
 *
 * Los datos estructurados son el caso puro de regla que **falla en silencio**: si se
 * rompen, la página sigue pintándose igual y nadie se entera. Es exactamente lo que
 * dice la cabecera de `metadatos.ts` de las etiquetas para compartir, y aquí es peor,
 * porque el destinatario no es una persona que note que falta la foto: es un
 * rastreador que no vuelve a decir nada.
 *
 * Lo que se fija, por orden de lo que cuesta si se rompe:
 *
 *   1. Que el precio y la disponibilidad sean los DE VERDAD. Si el buscador enseña un
 *      precio y la tienda cobra otro, Google retira los resultados enriquecidos del
 *      sitio entero.
 *   2. Que las URL sean ABSOLUTAS. Una relativa en un JSON-LD no es «menos buena»: es
 *      inservible, porque quien la lee no está en nuestro dominio.
 *   3. Que una identidad a medias no genere un domicilio a medias.
 */

const PRODUCTO: Producto = {
  id: "76d0058a-9717-4e8c-ab40-631925a95d0d",
  nombre: "Nucita",
  descripcion: "Crema de avellana y cacao en vasito.",
  precio: 0.5,
  imagenes: ["https://ejemplo.supabase.co/storage/v1/object/public/productos/nucita.webp"],
  categoria: "Dulces",
  stock_disponible: 36,
  stock_reservado: 0,
  activo: true,
  slug: "nucita",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
  familia: null,
  variante: null,
  variante_tipo: null,
  iva_pct: 10,
} as unknown as Producto;

const IDENTIDAD: IdentidadPublica = {
  nombre: "Leydy Jhoanna Mendoza Sanchez",
  nif: "Z4194001W",
  direccion: "Calle del Arco, 9",
  codigo_postal: "28840",
  ciudad: "Mejorada del Campo",
  provincia: "Madrid",
  pais: "ES",
  email: "valatino@hotmail.com",
  whatsapp: "34658498049",
  telefono: null,
  identificada: true,
  contactable: true,
};

describe("el comercio", () => {
  it("se declara como tienda con nombre, dominio y logo absolutos", () => {
    const f = comercio();

    expect(f["@type"]).toBe("OnlineStore");
    expect(f.name).toBe("Valatino");
    expect(f.url).toBe("https://valatino.es");
    expect(f.logo).toBe("https://valatino.es/portada.png");
  });

  /**
   * ⭐ El `@id` es lo que cose todas las fichas a la MISMA entidad. Sin él, la ficha
   * de cada producto declararía su propio vendedor suelto y el buscador vería veinte
   * comercios distintos que resultan llamarse igual.
   */
  it("tiene un @id estable del que cuelgan las demás fichas", () => {
    expect(comercio()["@id"]).toBe("https://valatino.es/#comercio");
    expect((sitioWeb().publisher as Record<string, string>)["@id"]).toBe(
      "https://valatino.es/#comercio",
    );
    const oferta = productoJsonLd(PRODUCTO).offers as Record<string, unknown>;
    expect((oferta.seller as Record<string, string>)["@id"]).toBe(
      "https://valatino.es/#comercio",
    );
  });

  /**
   * ⚠️ `SearchAction` prometería un buscador interno, y la tienda no tiene ninguno.
   * Declararlo sería mandar al rastreador a una URL que da 404.
   */
  it("el sitio NO promete un buscador que no existe", () => {
    expect(sitioWeb()).not.toHaveProperty("potentialAction");
  });
});

describe("la ficha de un producto", () => {
  /** ⭐ El número, no «0,50 €»: el JSON-LD lo lee una máquina. */
  it("lleva el precio como número y en euros", () => {
    const oferta = productoJsonLd(PRODUCTO).offers as Record<string, unknown>;

    expect(oferta.price).toBe(0.5);
    expect(oferta.priceCurrency).toBe("EUR");
    // El catálogo va con IVA incluido, y decirlo evita que se lea como base imponible.
    expect(oferta.valueAddedTaxIncluded).toBe(true);
  });

  it("dice que hay stock cuando hay stock", () => {
    const oferta = productoJsonLd(PRODUCTO).offers as Record<string, unknown>;
    expect(oferta.availability).toBe("https://schema.org/InStock");
  });

  /**
   * ⚠️ Y que NO hay cuando no hay. Anunciar disponible lo agotado es la forma más
   * rápida de que Google retire los resultados enriquecidos del sitio.
   */
  it("y que no hay cuando está agotado", () => {
    const agotado = { ...PRODUCTO, stock_disponible: 0 } as Producto;
    const oferta = productoJsonLd(agotado).offers as Record<string, unknown>;

    expect(oferta.availability).toBe("https://schema.org/OutOfStock");
  });

  it("apunta a su ficha con URL absoluta y por slug", () => {
    const f = productoJsonLd(PRODUCTO);
    expect(f.url).toBe("https://valatino.es/productos/nucita");
  });

  /** Sin slug se cae al id, igual que el resto de la tienda. */
  it("sin slug usa el id", () => {
    const sinSlug = { ...PRODUCTO, slug: null } as unknown as Producto;
    expect(productoJsonLd(sinSlug).url).toBe(`https://valatino.es/productos/${PRODUCTO.id}`);
  });

  /**
   * ⚠️ Una URL relativa aquí no es «peor», es inservible: quien la lee no está en
   * nuestro dominio. Es el mismo razonamiento que la `og:image` de `metadatos.ts`.
   */
  it("la imagen es absoluta", () => {
    expect(String(productoJsonLd(PRODUCTO).image)).toMatch(/^https:\/\//);
  });

  it("las migas van de la portada al producto, sin niveles inventados", () => {
    const migas = migasDeProducto(PRODUCTO).itemListElement as Array<Record<string, unknown>>;

    expect(migas).toHaveLength(2);
    expect(migas[0]).toMatchObject({ position: 1, item: "https://valatino.es" });
    expect(migas[1]).toMatchObject({
      position: 2,
      name: "Nucita",
      item: "https://valatino.es/productos/nucita",
    });
  });
});

describe("el comercio con la identidad de la tienda", () => {
  it("añade el domicilio, el NIF y el nombre legal", () => {
    const f = comercioConIdentidad(IDENTIDAD);

    expect(f.legalName).toBe("Leydy Jhoanna Mendoza Sanchez");
    expect(f.taxID).toBe("Z4194001W");
    expect(f.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "Calle del Arco, 9",
      postalCode: "28840",
      addressLocality: "Mejorada del Campo",
      addressRegion: "Madrid",
      addressCountry: "ES",
    });
    // El nombre comercial no lo pisa el legal: la tienda se sigue llamando Valatino.
    expect(f.name).toBe("Valatino");
  });

  /**
   * ⭐⭐ EL CASO QUE DE VERDAD PASA: la API dormida devuelve la identidad vacía, y eso
   * es indistinguible de «la tienda no ha configurado sus datos». Ya dejó las tres
   * páginas legales en blanco dos sesiones seguidas.
   *
   * Lo que NO puede pasar es que salga un domicilio con solo el país dentro: el
   * buscador se quedaría con una dirección que no lleva a ningún sitio.
   */
  it("con la identidad vacía no inventa un domicilio a medias", () => {
    const vacia = {
      nombre: null,
      nif: null,
      direccion: null,
      codigo_postal: null,
      ciudad: null,
      provincia: null,
      pais: null,
      email: null,
      whatsapp: null,
      telefono: null,
      identificada: false,
      contactable: false,
    } as IdentidadPublica;

    const f = comercioConIdentidad(vacia);

    expect(f).not.toHaveProperty("address");
    expect(f).not.toHaveProperty("taxID");
    expect(f).not.toHaveProperty("legalName");
    // Pero sigue diciendo quién es y dónde vive la tienda, que eso no depende de la API.
    expect(f.name).toBe("Valatino");
    expect(f.url).toBe("https://valatino.es");
  });

  /** Media identidad: el domicilio sale con lo que hay, no con huecos. */
  it("con media dirección pone solo lo que existe", () => {
    const f = comercioConIdentidad({ ...IDENTIDAD, direccion: null, codigo_postal: null });
    const dir = f.address as Record<string, unknown>;

    expect(dir).not.toHaveProperty("streetAddress");
    expect(dir).not.toHaveProperty("postalCode");
    expect(dir.addressLocality).toBe("Mejorada del Campo");
  });
});

/**
 * ⚠️⚠️ Y LO QUE NUNCA PUEDE PASAR: que un dato escrito desde el panel cierre el
 * `<script>`. El nombre de un producto lo teclea una persona, y dentro de un `<script>`
 * el navegador busca `</script` sin importarle que esté en una cadena JSON.
 *
 * El escape vive en el componente `JsonLd`, pero se comprueba aquí porque es donde
 * están los datos: si algún día alguien serializa estas fichas por otro camino, este
 * test recuerda que el peligro existe.
 */
describe("el dato del panel no puede romper el script", () => {
  it("JSON.stringify por sí solo NO protege, y por eso hace falta escapar", () => {
    const malicioso = { ...PRODUCTO, nombre: '</script><img onerror=alert(1)>' } as Producto;
    const crudo = JSON.stringify(productoJsonLd(malicioso));

    // Esto es lo que demuestra que el escape del componente es necesario.
    expect(crudo).toContain("</script>");

    // Y así queda una vez escapado, que es lo que hace `JsonLd`.
    const escapado = crudo.replace(/</g, "\\u003c");
    expect(escapado).not.toContain("</script>");
    expect(escapado).toContain("\\u003c/script");
  });
});
