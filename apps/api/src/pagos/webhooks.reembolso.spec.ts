import { PagosController } from "./webhooks.controller";
import type Stripe from "stripe";

/**
 * ⚠️⚠️ ESTE FICHERO EXISTE POR UN HUECO CONCRETO, Y CONVIENE SABER CUÁL.
 *
 * El correo duplicado del 2026-08-25 se arregló haciendo que el webhook apunte la
 * transacción del reembolso con el **id del refund** en vez de con el del evento, para
 * que choque con la fila que ya escribió el panel y la unicidad de `evento_id` decida
 * quién avisa al cliente.
 *
 * Todo el razonamiento vive en un comentario… y el comentario no falla cuando alguien
 * cambia una línea. `eventoId: event.id` es lo que hay en los otros tres sitios del
 * controlador, así que es exactamente el tipo de cosa que se «unifica» sin querer, y
 * el duplicado volvería sin que ningún test se quejara: el spec de
 * `ConfirmacionPedidoService` recibe el `eventoId` ya decidido, así que no puede verlo.
 *
 * ⚠️⚠️ Y LA PRIMERA VERSIÓN DE ESTE FICHERO PASABA EN VERDE CON EL FALLO DENTRO. Su
 * cargo de ejemplo traía `refunds.data`, y Stripe no lo manda desde la API 2022-11-15:
 * 0 de 14 avisos reales lo llevaban (medido el 2026-10-07 en `transacciones_pago`). El
 * cargo de `cargo()` tiene ahora la forma de los reales, sin la lista.
 *
 * Se prueba SOLO el camino de `charge.refunded`. Las dependencias que ese camino no
 * toca van como `{}`: si mañana lo tocan, el test se cae con un error claro en vez de
 * pasar por casualidad.
 */
function montar(
  charge: Partial<Stripe.Charge>,
  opciones: { yaProcesado?: boolean; refundSegunStripe?: string | null } = {},
) {
  const registro = {
    reembolsos: [] as Array<{ eventoId: string; tipoEvento: string; importe: number }>,
    preguntasAStripe: [] as Array<[string, number]>,
  };

  const evento = {
    id: "evt_DEL_EVENTO",
    type: "charge.refunded",
    data: { object: charge },
  } as unknown as Stripe.Event;

  const stripeService = {
    constructEvent: () => evento,
    refundQueLoDisparo: async (cargoId: string, acumuladoCents: number) => {
      registro.preguntasAStripe.push([cargoId, acumuladoCents]);
      return opciones.refundSegunStripe === undefined ? "re_EL_REFUND" : opciones.refundSegunStripe;
    },
  };

  const inventarioService = {
    eventoYaProcesado: async () => opciones.yaProcesado ?? false,
  };

  const confirmacionPedido = {
    procesarReembolso: async (r: { eventoId: string; tipoEvento: string; importe: number }) => {
      registro.reembolsos.push(r);
      return "ped-1";
    },
  };

  const controlador = new PagosController(
    stripeService as never,
    {} as never,
    inventarioService as never,
    {} as never,
    confirmacionPedido as never,
    {} as never,
    {} as never,
  );

  const peticion = { rawBody: Buffer.from("{}") } as never;

  return { controlador, registro, peticion };
}

/** Con la forma de los avisos reales: SIN `refunds`. */
const cargo = (acumuladoCents = 340): Partial<Stripe.Charge> => ({
  id: "ch_EL_CARGO",
  payment_intent: "pi_123",
  amount_refunded: acumuladoCents,
});

describe("el webhook charge.refunded y la llave del apunte", () => {
  /**
   * ⭐ LA PRUEBA QUE IMPORTA. El panel apunta con `re_…`; si el webhook apunta con
   * `evt_…` las dos filas entran y el cliente recibe dos correos.
   */
  it("apunta con el id del refund que da Stripe, no con el del evento", async () => {
    const { controlador, registro, peticion } = montar(cargo());

    await controlador.handleStripeWebhook(peticion, "firma");

    expect(registro.reembolsos).toHaveLength(1);
    expect(registro.reembolsos[0].eventoId).toBe("re_EL_REFUND");
  });

  /**
   * El acumulado es lo que identifica CUÁL de las devoluciones del cargo fue: con
   * varias, preguntar solo por el cargo daría la de otra.
   */
  it("pregunta por ESTE cargo y con el acumulado de ESTE aviso", async () => {
    const { controlador, registro, peticion } = montar(cargo(1040));

    await controlador.handleStripeWebhook(peticion, "firma");

    expect(registro.preguntasAStripe).toEqual([["ch_EL_CARGO", 1040]]);
  });

  /**
   * ⚠️ Si Stripe no sabe decirlo, se cae al id del evento. Es una llave peor, y
   * puede volver a duplicar el correo, pero es mejor que no apuntar la devolución.
   */
  it("si no se puede averiguar se cae al id del evento en vez de no apuntar nada", async () => {
    const { controlador, registro, peticion } = montar(cargo(), { refundSegunStripe: null });

    await controlador.handleStripeWebhook(peticion, "firma");

    expect(registro.reembolsos).toHaveLength(1);
    expect(registro.reembolsos[0].eventoId).toBe("evt_DEL_EVENTO");
  });

  /** El importe sigue siendo el ACUMULADO del cargo, que es lo que dice Stripe. */
  it("manda el acumulado devuelto, en euros", async () => {
    const { controlador, registro, peticion } = montar(cargo(1341));

    await controlador.handleStripeWebhook(peticion, "firma");

    expect(registro.reembolsos[0].importe).toBe(13.41);
  });

  /**
   * ⚠️ Y la reentrega del MISMO evento la sigue cortando `eventoYaProcesado(event.id)`,
   * que es independiente de la llave del apunte. Cambiar una cosa no podía romper la
   * otra, y esto es lo que lo fija.
   */
  it("un evento ya procesado no vuelve a procesarse", async () => {
    const { controlador, registro, peticion } = montar(cargo(), { yaProcesado: true });

    await controlador.handleStripeWebhook(peticion, "firma");

    expect(registro.reembolsos).toEqual([]);
    expect(registro.preguntasAStripe).toEqual([]);
  });
});
