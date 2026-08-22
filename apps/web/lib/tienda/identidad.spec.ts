import type { IdentidadPublica } from "@valatino/types";
import {
  domicilioEnUnaLinea,
  enlaceWhatsapp,
  IDENTIDAD_VACIA,
  whatsappLegible,
} from "./identidad";

/**
 * Estos tests existen porque **esto falla en silencio y a la vista de todos**.
 *
 * Un enlace de WhatsApp mal construido abre la aplicación con «número no válido»
 * y quien lo ve concluye que la tienda ha puesto un teléfono falso. Un domicilio
 * que dice «Madrid · Madrid» parece una errata en la única página donde el
 * cliente ha ido a comprobar que la tienda es seria. Ni lo uno ni lo otro da
 * error, ni sale en ningún log: solo resta confianza en el peor momento.
 */
const base = (extra: Partial<IdentidadPublica> = {}): IdentidadPublica => ({
  ...IDENTIDAD_VACIA,
  nombre: "Leydy Jhoanna Mendoza Sanchez",
  nif: "Z4194001W",
  direccion: "Calle del Arco, 9",
  codigo_postal: "28840",
  ciudad: "Mejorada del Campo",
  provincia: "Madrid",
  pais: "ES",
  identificada: true,
  ...extra,
});

describe("domicilioEnUnaLinea", () => {
  it("escribe el domicilio como se escribe en España", () => {
    expect(domicilioEnUnaLinea(base())).toBe(
      "Calle del Arco, 9 · 28840 Mejorada del Campo · Madrid",
    );
  });

  /**
   * ⚠️ EL CASO QUE JUSTIFICA LA REGLA. En España hay unas cuantas capitales que
   * se llaman igual que su provincia. «Madrid · Madrid» se lee como un fallo del
   * programa, justo en la página donde el cliente ha entrado a comprobar que la
   * tienda es de fiar.
   */
  it("no repite la provincia cuando coincide con la población", () => {
    expect(domicilioEnUnaLinea(base({ ciudad: "Madrid", provincia: "Madrid" }))).toBe(
      "Calle del Arco, 9 · 28840 Madrid",
    );
    expect(domicilioEnUnaLinea(base({ ciudad: "Murcia", provincia: "murcia" }))).toBe(
      "Calle del Arco, 9 · 28840 Murcia",
    );
  });

  it("aguanta que falten piezas sueltas", () => {
    expect(domicilioEnUnaLinea(base({ codigo_postal: null, provincia: null }))).toBe(
      "Calle del Arco, 9 · Mejorada del Campo",
    );
  });

  /** Media dirección no es una dirección: mejor no enseñar nada. */
  it("sin calle no hay domicilio", () => {
    expect(domicilioEnUnaLinea(base({ direccion: null }))).toBeNull();
    expect(domicilioEnUnaLinea(base({ direccion: "   " }))).toBeNull();
    expect(domicilioEnUnaLinea(IDENTIDAD_VACIA)).toBeNull();
  });
});

describe("enlaceWhatsapp", () => {
  it("construye el enlace de wa.me", () => {
    expect(enlaceWhatsapp(base({ whatsapp: "34600111222" }))).toBe(
      "https://wa.me/34600111222",
    );
  });

  it("escapa el mensaje previo", () => {
    const url = enlaceWhatsapp(base({ whatsapp: "34600111222" }), "Hola, ¿tenéis Chocoramo?");
    expect(url).toBe("https://wa.me/34600111222?text=Hola%2C%20%C2%BFten%C3%A9is%20Chocoramo%3F");
  });

  it("sin número no hay enlace, y no una URL rota", () => {
    expect(enlaceWhatsapp(base({ whatsapp: null }))).toBeNull();
  });
});

describe("whatsappLegible", () => {
  it("agrupa un número español como se lee", () => {
    expect(whatsappLegible(base({ whatsapp: "34600111222" }))).toBe("+34 600 11 12 22");
  });

  it("un número extranjero se deja entero con su +", () => {
    expect(whatsappLegible(base({ whatsapp: "573001234567" }))).toBe("+573001234567");
  });

  it("sin número, null", () => {
    expect(whatsappLegible(base({ whatsapp: null }))).toBeNull();
  });
});
