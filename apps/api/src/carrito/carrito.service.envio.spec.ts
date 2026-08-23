import { SupabaseClient } from "@supabase/supabase-js";
import { CarritoService } from "./carrito.service";

/**
 * El envío en el carrito (migración 080).
 *
 * ⚠️⚠️ POR QUÉ ESTE FICHERO EXISTE, Y ES LO QUE HAY QUE ENTENDER ANTES DE
 * TOCARLO: `carrito.total` es EL IMPORTE QUE SE LE COBRA AL CLIENTE. Los dos
 * sitios que crean el pago —`createPaymentIntent` y `createOrder`— le pasan este
 * número a Stripe y a PayPal. Si el envío no entra aquí, no se cobra en ningún
 * sitio, y la avería es exactamente la que se venía arrastrando: enviar gratis
 * sin haberlo decidido.
 *
 * Y falla en silencio: un total sin porte no da error ni sale en ningún log.
 * Solo cobra de menos.
 *
 * Lo que se fija, por orden de lo que cuesta si se rompe:
 *
 *   1. Que `total` = artículos + envío. Es el dinero.
 *   2. Que el porte lo decide LA BASE (`coste_envio_de`) y no este fichero.
 *   3. Que un fallo de la RPC no tumba el carrito, y cobra 0 en vez de reventar.
 *   4. Que un carrito vacío no paga porte.
 */

const CARRITO_ID = "cccccccc-0000-4000-8000-000000000001";
const PRODUCTO_ID = "pppppppp-0000-4000-8000-000000000001";
const SESSION = "ssssssss-0000-4000-8000-000000000001";

interface Opciones {
  /** Lo que devuelve `coste_envio_de`. `"error"` simula que la RPC falla. */
  costeEnvio: number | "error";
  umbral?: number | null;
  /** Líneas del carrito: [precio, cantidad]. Vacío = carrito vacío. */
  lineas?: Array<[number, number]>;
  /** El código guardado en `carritos.codigo_descuento` (083). */
  codigo?: string | null;
  /**
   * Lo que contesta `codigo_descuento_aplicable`. `"error"` simula que la RPC falla.
   *
   * ⚠️ Es una fila SUELTA, no un array, aunque PostgREST entregue arrays para
   * `returns table`: el servicio tiene que saber tratar las dos formas y esto lo
   * comprueba envolviéndola.
   */
  aplicable?:
    | { valido: boolean; motivo: string | null; descuento: number; envio_gratis: boolean }
    | "error";
  /** El porte SIN código, para medir lo que ahorra un código de envío gratis. */
  costeEnvioSinCodigo?: number;
}

function montar(opciones: Opciones) {
  const lineas = opciones.lineas ?? [[4.5, 2]];
  const registro = { rpc: [] as Array<{ fn: string; args: Record<string, unknown> }> };

  const tabla = (nombre: string) => {
    if (nombre === "carritos") {
      // `getOrCreate` encadena distinto según haya usuario o no: con sesión
      // anónima añade `.is("user_id", null)`. Se simulan las dos formas.
      const encontrado = async () => ({
        data: { id: CARRITO_ID, codigo_descuento: opciones.codigo ?? null },
        error: null,
      });
      return {
        select: () => ({
          eq: () => ({ maybeSingle: encontrado, is: () => ({ maybeSingle: encontrado }) }),
        }),
      };
    }

    if (nombre === "carrito_items") {
      return {
        select: () => ({
          eq: async () => ({
            data: lineas.map(([precio, cantidad], i) => ({
              id: `item-${i}`,
              cantidad,
              precio_unitario: precio,
              producto_id: PRODUCTO_ID,
            })),
            error: null,
          }),
        }),
      };
    }

    if (nombre === "productos") {
      return {
        select: () => ({
          in: async () => ({
            data: [{ id: PRODUCTO_ID, nombre: "Chocoramo", imagenes: [] }],
            error: null,
          }),
        }),
      };
    }

    if (nombre === "ajustes_tienda") {
      return {
        select: () => ({
          maybeSingle: async () => ({
            data: { envio_gratis_desde: opciones.umbral ?? null },
            error: null,
          }),
        }),
      };
    }

    throw new Error(`tabla no simulada: ${nombre}`);
  };

  const supabase = {
    from: (nombre: string) => tabla(nombre),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      registro.rpc.push({ fn, args });

      if (fn === "codigo_descuento_aplicable") {
        if (opciones.aplicable === "error") {
          return { data: null, error: { message: "conexión perdida con la base" } };
        }
        // Envuelto en array, que es como lo entrega PostgREST un `returns table`.
        return { data: opciones.aplicable ? [opciones.aplicable] : [], error: null };
      }

      if (opciones.costeEnvio === "error") {
        return { data: null, error: { message: "conexión perdida con la base" } };
      }

      // Con código de envío gratis el porte es 0; sin código, la tarifa. Es lo que
      // permite medir `envioDescontado` sin reimplementar nada.
      if (fn === "coste_envio_de" && args.p_codigo == null && opciones.costeEnvioSinCodigo !== undefined) {
        return { data: opciones.costeEnvioSinCodigo, error: null };
      }

      return { data: opciones.costeEnvio, error: null };
    },
  } as unknown as SupabaseClient;

  return { servicio: new CarritoService(supabase), registro };
}

describe("el envío en el carrito", () => {
  it("suma el porte al total, que es lo que se cobra", async () => {
    const { servicio } = montar({ costeEnvio: 4.95 });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.subtotal).toBe(9);
    expect(carrito.costeEnvio).toBe(4.95);
    expect(carrito.total).toBe(13.95);
  });

  /**
   * ⚠️⚠️ EL TEST QUE PROTEGE LA REGLA. El servicio no compara el subtotal con el
   * umbral: le pregunta a `coste_envio_de` y usa la respuesta tal cual.
   *
   * Aquí el subtotal (9 €) está MUY por debajo del umbral (40 €) y la base
   * responde 0. Si alguien reescribiera esto aplicando la regla en TypeScript,
   * este test se pondría rojo — que es exactamente para lo que está.
   */
  it("respeta lo que dice la base aunque contradiga al umbral", async () => {
    const { servicio, registro } = montar({ costeEnvio: 0, umbral: 40 });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.costeEnvio).toBe(0);
    expect(carrito.total).toBe(carrito.subtotal);
    // ⚠️ `p_codigo` va SIEMPRE, aunque sea null: desde la 083 es `coste_envio_de`
    // quien decide si un código de envío gratis pone el porte a 0, y filtrar aquí
    // los códigos inválidos sería tomar esa decisión dos veces.
    expect(registro.rpc).toEqual([
      { fn: "coste_envio_de", args: { p_subtotal: 9, p_codigo: null } },
    ]);
  });

  it("le pasa a la base el subtotal de los artículos, no el total", async () => {
    const { servicio, registro } = montar({ costeEnvio: 4.95, lineas: [[0.62, 3]] });
    await servicio.getCarrito(SESSION);

    // 0,62 × 3 = 1,86 — y no 6,81, que sería con el porte dentro. Preguntar con
    // el porte incluido haría que un umbral se alcanzara antes de lo debido.
    expect(registro.rpc[0]?.args).toEqual({ p_subtotal: 1.86, p_codigo: null });
  });

  // ── 083 · el código de descuento en el carrito ──────────────────────────────

  it("resta el descuento del total, que es lo que se cobra", async () => {
    const { servicio } = montar({
      costeEnvio: 4.95,
      codigo: "verano20",
      aplicable: { valido: true, motivo: null, descuento: 1.8, envio_gratis: false },
    });
    const carrito = await servicio.getCarrito(SESSION);

    // 9,00 de artículos + 4,95 de porte − 1,80 de descuento
    expect(carrito.subtotal).toBe(9);
    expect(carrito.descuento).toBe(1.8);
    expect(carrito.total).toBe(12.15);
    // Normalizado, que es como lo guardó el panel y como saldrá en la factura.
    expect(carrito.codigoDescuento).toBe("VERANO20");
    expect(carrito.avisoDescuento).toBeNull();
  });

  it("le pasa el código CRUDO a la base, sin filtrarlo antes", async () => {
    const { servicio, registro } = montar({
      costeEnvio: 4.95,
      codigo: "  verano20 ",
      aplicable: { valido: true, motivo: null, descuento: 1.8, envio_gratis: false },
    });
    await servicio.getCarrito(SESSION);

    // ⚠️ Las DOS funciones lo reciben tal cual. Decidir aquí si vale sería tomar la
    // decisión dos veces, y el día que difirieran el carrito enseñaría un porte y
    // la venta cobraría otro.
    expect(registro.rpc.find((r) => r.fn === "codigo_descuento_aplicable")?.args).toEqual({
      p_codigo: "  verano20 ",
      p_subtotal: 9,
    });
    expect(registro.rpc.find((r) => r.fn === "coste_envio_de")?.args).toEqual({
      p_codigo: "  verano20 ",
      p_subtotal: 9,
    });
  });

  /**
   * ⚠️⚠️ UN CÓDIGO QUE DEJÓ DE VALER NO PUEDE DESAPARECER EN SILENCIO. Puede caducar
   * o agotarse entre que el cliente lo aplica y que vuelve al carrito, y sin aviso
   * vería subir el total sin saber por qué. El texto lo redacta la BASE.
   */
  it("un código que ya no vale no descuenta, pero lo DICE", async () => {
    const { servicio } = montar({
      costeEnvio: 4.95,
      codigo: "caducado",
      aplicable: { valido: false, motivo: "Ese código ha caducado", descuento: 0, envio_gratis: false },
    });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.descuento).toBe(0);
    expect(carrito.total).toBe(13.95);
    expect(carrito.codigoDescuento).toBeNull();
    expect(carrito.avisoDescuento).toBe("Ese código ha caducado");
  });

  it("un código de envío gratis pone el porte a 0 y dice cuánto ahorra", async () => {
    const { servicio } = montar({
      costeEnvio: 0, // lo que devuelve `coste_envio_de` CON el código
      costeEnvioSinCodigo: 4.95, // lo que habría costado sin él
      codigo: "ENVIOGRATIS",
      aplicable: { valido: true, motivo: null, descuento: 0, envio_gratis: true },
    });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.costeEnvio).toBe(0);
    // ⚠️ El envío gratis NO es un descuento sobre la base: no toca `descuento`.
    expect(carrito.descuento).toBe(0);
    expect(carrito.envioDescontado).toBe(4.95);
    expect(carrito.total).toBe(9);
  });

  it("si no se puede comprobar el código, el carrito sigue en pie y avisa", async () => {
    // ⚠️ El signo del fallo es el CONTRARIO que en el porte: quedarse sin descuento
    // le cobra al cliente más de lo que esperaba, que es un motivo para no comprar.
    // Así que la tienda no se cae, pero el cliente se entera.
    const { servicio } = montar({ costeEnvio: 4.95, codigo: "verano20", aplicable: "error" });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.descuento).toBe(0);
    expect(carrito.total).toBe(13.95);
    expect(carrito.codigoDescuento).toBeNull();
    expect(carrito.avisoDescuento).toMatch(/no podemos comprobar tu c/i);
  });

  /**
   * ⚠️ Un fallo al calcular el porte NO puede tumbar el carrito: es la pantalla
   * más vista de la tienda, y el envío es un cargo adicional. De los dos fallos
   * posibles —dejar de cobrar un porte, o dejar la tienda sin carrito— el barato
   * es el primero.
   */
  it("si la RPC falla, cobra 0 en vez de reventar el carrito", async () => {
    const { servicio } = montar({ costeEnvio: "error" });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.items).toHaveLength(1);
    expect(carrito.costeEnvio).toBe(0);
    expect(carrito.total).toBe(carrito.subtotal);
  });

  it("un carrito vacío no paga porte y no le pregunta a la base", async () => {
    const { servicio, registro } = montar({ costeEnvio: 4.95, lineas: [] });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.items).toEqual([]);
    expect(carrito.subtotal).toBe(0);
    expect(carrito.costeEnvio).toBe(0);
    expect(carrito.total).toBe(0);
    expect(registro.rpc).toEqual([]);
  });

  it("lleva el umbral para que el carrito pueda enseñarlo", async () => {
    const { servicio } = montar({ costeEnvio: 4.95, umbral: 40 });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.envioGratisDesde).toBe(40);
  });

  it("sin umbral configurado, lo dice con null y no con 0", async () => {
    const { servicio } = montar({ costeEnvio: 4.95, umbral: null });
    const carrito = await servicio.getCarrito(SESSION);

    // 0 se leería como «gratis desde 0 €», que dejaría el envío gratis siempre.
    expect(carrito.envioGratisDesde).toBeNull();
  });

  /**
   * El céntimo de la coma flotante. `0.95 * 7` es `6.6499999999999995`, y ese
   * número viaja en el JSON del carrito hasta el navegador.
   */
  it("no arrastra la cola de la coma flotante en el subtotal ni en el total", async () => {
    const { servicio } = montar({ costeEnvio: 4.95, lineas: [[0.95, 7]] });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.subtotal).toBe(6.65);
    expect(carrito.total).toBe(11.6);
  });

  /**
   * ⚠️ Y TAMBIÉN EN CADA LÍNEA, que es donde se escapaba. Se vio en producción:
   * `0.62 × 3` salía como `1.8599999999999999` en el JSON del carrito.
   *
   * `formatEUR` lo tapaba al pintarlo, así que nadie lo veía. Dejó de ser
   * inofensivo cuando el carrito empezó a enseñar una fila de «Subtotal»: ahora
   * hay dos importes en pantalla que el cliente puede sumar, y un campo de dinero
   * de una API que acaba en un cobro no puede llevar cola binaria.
   */
  it("tampoco la arrastra en el subtotal de cada línea", async () => {
    const { servicio } = montar({ costeEnvio: 0, lineas: [[0.62, 3]] });
    const carrito = await servicio.getCarrito(SESSION);

    expect(carrito.items[0]?.subtotal).toBe(1.86);
    expect(String(carrito.items[0]?.subtotal)).toBe("1.86");
  });
});
