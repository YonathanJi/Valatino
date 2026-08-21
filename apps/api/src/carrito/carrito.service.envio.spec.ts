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
}

function montar(opciones: Opciones) {
  const lineas = opciones.lineas ?? [[4.5, 2]];
  const registro = { rpc: [] as Array<{ fn: string; args: Record<string, unknown> }> };

  const tabla = (nombre: string) => {
    if (nombre === "carritos") {
      // `getOrCreate` encadena distinto según haya usuario o no: con sesión
      // anónima añade `.is("user_id", null)`. Se simulan las dos formas.
      const encontrado = async () => ({ data: { id: CARRITO_ID }, error: null });
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
      if (opciones.costeEnvio === "error") {
        return { data: null, error: { message: "conexión perdida con la base" } };
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
    expect(registro.rpc).toEqual([
      { fn: "coste_envio_de", args: { p_subtotal: 9 } },
    ]);
  });

  it("le pasa a la base el subtotal de los artículos, no el total", async () => {
    const { servicio, registro } = montar({ costeEnvio: 4.95, lineas: [[0.62, 3]] });
    await servicio.getCarrito(SESSION);

    // 0,62 × 3 = 1,86 — y no 6,81, que sería con el porte dentro. Preguntar con
    // el porte incluido haría que un umbral se alcanzara antes de lo debido.
    expect(registro.rpc[0]?.args).toEqual({ p_subtotal: 1.86 });
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
});
