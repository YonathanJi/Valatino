import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import type { InventarioService } from "../inventario/inventario.service";
import type { EmailService } from "../email/email.service";
import type { ReembolsosService } from "./reembolsos.service";
import type { EventosPedidoService } from "../eventos/eventos-pedido.service";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * El cinturón de la metadata del pago (083).
 *
 * ⚠️⚠️ POR QUÉ ESTE FICHERO EXISTE. `checkout_datos` se borra a las 48 h por pg_cron
 * (019). Un webhook que llegue después dejaba a `confirmar_venta` sin el porte —caía
 * a la tarifa vigente— y sin el descuento —caía a CERO—, y lo segundo es peor: el
 * pedido diría MÁS de lo que se cobró, y en silencio salvo por un evento.
 *
 * La metadata del intent no la borra nadie y es exactamente el dinero de ESE pago, así
 * que se usa para rehacer la mitad de dinero del snapshot antes de confirmar.
 *
 * Lo que se fija, por orden de lo que cuesta si se rompe:
 *
 *   1. Que cuando el snapshot EXISTE no se toque. Lleva la dirección, el email y el
 *      documento; rehacerlo por encima los borraría para escribir cuatro números, y
 *      el pedido saldría sin dirección de envío.
 *   2. Que cuando NO existe se rehaga, con el dinero del intent y no con otro.
 *   3. Que sin metadata (PayPal) no se invente nada.
 */

const DINERO = {
  costeEnvio: 3.4,
  descuento: 3,
  descuentoCodigo: "VERANO20",
  envioDescontado: 0,
};

interface Opciones {
  /** `null` = la limpieza de 48 h ya se llevó la fila. */
  checkout?: Record<string, unknown> | null;
  /** El dinero de la metadata. `undefined` = no vino (PayPal). */
  dinero?: typeof DINERO;
  sessionId?: string;
}

function montar(o: Opciones = {}) {
  const llamadas = {
    rehechos: [] as Array<{ sessionId: string; dinero: typeof DINERO }>,
    confirmados: [] as Array<Record<string, unknown>>,
  };

  const inventario = {
    getCheckoutDatos: async () => (o.checkout === undefined ? null : o.checkout),
    rehacerSnapshotDinero: async (sessionId: string, dinero: typeof DINERO) => {
      llamadas.rehechos.push({ sessionId, dinero });
    },
    confirmarVentaYCrearPedido: async (dto: Record<string, unknown>) => {
      llamadas.confirmados.push(dto);
      return "ped-1";
    },
    registrarTransaccion: async () => undefined,
  } as unknown as InventarioService;

  // El servicio hace `from("profiles").select().eq().maybeSingle()` y una RPC para
  // anotar la forma de pago. Nada de eso es lo que se mide aquí.
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
    rpc: async () => ({ error: null }),
  } as unknown as SupabaseClient;

  const servicio = new ConfirmacionPedidoService(
    inventario,
    { enviarConfirmacionPedido: async () => undefined } as unknown as EmailService,
    supabase,
    {} as unknown as ReembolsosService,
    { registrar: async () => undefined } as unknown as EventosPedidoService,
  );

  const pago = {
    proveedor: "stripe" as const,
    eventoId: "evt_1",
    tipoEvento: "payment_intent.succeeded",
    sessionId: o.sessionId ?? "ses-1",
    referenciaPago: "pi_1",
    importe: 15.4,
    payloadRaw: {},
    dineroDelIntent: o.dinero,
  };

  return { servicio, llamadas, pago };
}

describe("el snapshot del checkout y la metadata del pago", () => {
  it("⚠️ si el snapshot EXISTE, no se toca", async () => {
    /**
     * Es la que más importa. `checkout_datos` lleva la dirección, el email y el
     * documento; rehacerlo por encima los borraría para escribir cuatro números y el
     * pedido saldría sin dirección de envío. `ignoreDuplicates` en el servicio es la
     * otra mitad de esta garantía, para la carrera.
     */
    const { servicio, llamadas, pago } = montar({
      checkout: {
        email: "cliente@ejemplo.com",
        documento: "12345678Z",
        direccion: { nombre_destinatario: "Quien sea", linea1: "Calle", ciudad: "Madrid" },
        coste_envio: 3.4,
      },
      dinero: DINERO,
    });

    await servicio.confirmarPago(pago);

    expect(llamadas.rehechos).toHaveLength(0);
    // Y la dirección del snapshot llega al pedido, que es lo que se estaría perdiendo.
    expect(llamadas.confirmados[0]).toMatchObject({
      direccionSnapshot: { ciudad: "Madrid" },
      emailCliente: "cliente@ejemplo.com",
    });
  });

  it("si el snapshot se limpió, se rehace con el dinero del intent", async () => {
    const { servicio, llamadas, pago } = montar({ checkout: null, dinero: DINERO });

    await servicio.confirmarPago(pago);

    expect(llamadas.rehechos).toEqual([{ sessionId: "ses-1", dinero: DINERO }]);
    // Y se rehace ANTES de confirmar: al revés no serviría de nada, porque
    // `confirmar_venta` lee el snapshot al empezar.
    expect(llamadas.confirmados).toHaveLength(1);
  });

  it("sin metadata de dinero (PayPal) no se inventa nada", async () => {
    // ⚠️ PayPal viaja con un `customId` de un solo campo. Por esa vía el agujero de
    // las 48 h sigue abierto igual que estaba, y eso es mejor que rellenarlo con
    // ceros: un descuento inventado es peor que uno que falta y se anota.
    const { servicio, llamadas, pago } = montar({ checkout: null, dinero: undefined });

    await servicio.confirmarPago(pago);

    expect(llamadas.rehechos).toHaveLength(0);
    expect(llamadas.confirmados).toHaveLength(1);
  });

  it("sin sessionId no hay fila que rehacer", async () => {
    // La clave de `checkout_datos` es la sesión: sin ella no hay dónde escribir.
    const { servicio, llamadas, pago } = montar({
      checkout: null,
      dinero: DINERO,
      sessionId: "",
    });

    await servicio.confirmarPago(pago);

    expect(llamadas.rehechos).toHaveLength(0);
  });
});
