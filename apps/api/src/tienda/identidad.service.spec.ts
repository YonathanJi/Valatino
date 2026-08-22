import { BadRequestException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { IdentidadService, normalizarWhatsapp } from "./identidad.service";

/**
 * ⚠️⚠️ POR QUÉ ESTO TIENE TESTS: un enlace de WhatsApp mal formado **falla en
 * silencio del lado del cliente**. `wa.me/+34 600 111 222` abre WhatsApp con un
 * error de «número no válido», y quien lo ve concluye que la tienda ha puesto un
 * número falso — no que el enlace esté mal construido. La tienda no se entera
 * nunca, porque el fallo ocurre en el móvil de otra persona.
 *
 * Es el mismo perfil de avería que la `og:image` y que el aviso de envío gratis:
 * no da error, no sale en ningún log, solo deja de funcionar.
 */
describe("normalizarWhatsapp", () => {
  it("deja pasar un número que ya viene bien", () => {
    expect(normalizarWhatsapp("34600111222")).toBe("34600111222");
  });

  it("quita el + y los espacios, que es como lo teclea cualquiera", () => {
    expect(normalizarWhatsapp("+34 600 11 12 22")).toBe("34600111222");
    expect(normalizarWhatsapp("+34-600-111-222")).toBe("34600111222");
    expect(normalizarWhatsapp("(+34) 600 111 222")).toBe("34600111222");
  });

  /**
   * ⚠️ El `00` de marcación internacional a la antigua es OTRO prefijo del mismo
   * país. Dejarlo daría `0034600111222`, que `wa.me` no reconoce.
   */
  it("entiende el 00 de marcación internacional", () => {
    expect(normalizarWhatsapp("0034600111222")).toBe("34600111222");
  });

  /**
   * ⚠️ La suposición está declarada y es la correcta para esta tienda, que vende
   * solo en España: nueve dígitos empezando por 6, 7, 8 o 9 es un número español
   * escrito sin prefijo, y sin el 34 delante el enlace no funciona.
   */
  it("le pone el 34 a un número español escrito sin prefijo", () => {
    expect(normalizarWhatsapp("600111222")).toBe("34600111222");
    expect(normalizarWhatsapp("711222333")).toBe("34711222333");
    expect(normalizarWhatsapp("911222333")).toBe("34911222333");
  });

  it("no toca un número extranjero que trae su prefijo", () => {
    expect(normalizarWhatsapp("573001234567")).toBe("573001234567"); // Colombia
  });

  it("vacío o ausente es null, no cadena vacía", () => {
    expect(normalizarWhatsapp("")).toBeNull();
    expect(normalizarWhatsapp(null)).toBeNull();
    expect(normalizarWhatsapp(undefined)).toBeNull();
    expect(normalizarWhatsapp("   ")).toBeNull();
  });

  it("rechaza lo que no puede ser un teléfono", () => {
    expect(normalizarWhatsapp("123")).toBeNull();
    expect(normalizarWhatsapp("no soy un telefono")).toBeNull();
    // 16 dígitos se sale de la E.164, que es el rango del CHECK de la 081.
    expect(normalizarWhatsapp("1234567890123456")).toBeNull();
  });
});

/** Doble mínimo de Supabase: la RPC de identidad y el update de la tabla. */
function montar(identidad: Record<string, unknown> | null, fallo?: string) {
  const registro = { updates: [] as Record<string, unknown>[] };

  const supabase = {
    rpc: async () =>
      fallo ? { data: null, error: { message: fallo } } : { data: identidad, error: null },
    from: () => ({
      update: (valores: Record<string, unknown>) => ({
        eq: async () => {
          registro.updates.push(valores);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  return { servicio: new IdentidadService(supabase), registro };
}

const IDENTIDAD = {
  nombre: "Leydy Jhoanna Mendoza Sanchez",
  nif: "Z4194001W",
  direccion: "Calle del Arco, 9",
  codigo_postal: "28840",
  ciudad: "Mejorada del Campo",
  provincia: "Madrid",
  pais: "ES",
  email: "hola@ejemplo.com",
  whatsapp: "34600111222",
  telefono: null,
  identificada: true,
  contactable: true,
};

describe("IdentidadService.publica", () => {
  it("devuelve lo que dice la base", async () => {
    const { servicio } = montar(IDENTIDAD);
    await expect(servicio.publica()).resolves.toEqual(IDENTIDAD);
  });

  /**
   * ⚠️⚠️ ESTE ES EL TEST QUE MÁS IMPORTA DE LOS TRES. Esto lo pinta el PIE DE
   * PÁGINA, o sea todas las páginas de la tienda. Si un fallo de la base
   * propagara la excepción, un hipo de Supabase tumbaría el catálogo entero por
   * no poder pintar un aviso legal.
   *
   * Se degrada a una identidad vacía —que las pantallas ya saben tratar, porque
   * es el mismo caso que «aún sin configurar»— y el fallo se registra alto.
   */
  it("un fallo de la base no tumba la tienda: devuelve identidad vacía", async () => {
    const { servicio } = montar(null, "conexión perdida");
    const r = await servicio.publica();

    expect(r.identificada).toBe(false);
    expect(r.contactable).toBe(false);
    expect(r.nombre).toBeNull();
    expect(r.email).toBeNull();
  });
});

describe("IdentidadService.guardarContacto", () => {
  it("normaliza el WhatsApp antes de guardarlo", async () => {
    const { servicio, registro } = montar(IDENTIDAD);
    await servicio.guardarContacto({ whatsapp: "+34 600 11 12 22" }, "actor-1");

    expect(registro.updates[0]).toMatchObject({ contacto_whatsapp: "34600111222" });
  });

  it("pasa el correo a minúsculas y sin espacios", async () => {
    const { servicio, registro } = montar(IDENTIDAD);
    await servicio.guardarContacto({ email: "  Hola@Ejemplo.COM  " }, "actor-1");

    expect(registro.updates[0]).toMatchObject({ contacto_email: "hola@ejemplo.com" });
  });

  /** Vaciar un canal lo BORRA. Si no, quitarlo del panel no lo quitaría de la web. */
  it("vaciar un canal lo borra de verdad", async () => {
    const { servicio, registro } = montar(IDENTIDAD);
    await servicio.guardarContacto({ email: "", whatsapp: "", telefono: "" }, "actor-1");

    expect(registro.updates[0]).toMatchObject({
      contacto_email: null,
      contacto_whatsapp: null,
      contacto_telefono: null,
    });
  });

  /**
   * ⚠️ Un WhatsApp que no se puede normalizar NO se guarda como null en silencio:
   * se rechaza. Guardarlo vacío dejaría al panel diciendo que se guardó y a la
   * web sin el botón, y nadie relacionaría las dos cosas.
   */
  it("rechaza un WhatsApp imposible en vez de guardarlo vacío", async () => {
    const { servicio, registro } = montar(IDENTIDAD);
    await expect(servicio.guardarContacto({ whatsapp: "123" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(registro.updates).toHaveLength(0);
  });
});
