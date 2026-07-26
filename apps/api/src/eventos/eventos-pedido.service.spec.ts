import { SupabaseClient } from "@supabase/supabase-js";
import { EventosPedidoService } from "./eventos-pedido.service";

function montar(opciones: { errorRpc?: string; lanza?: boolean } = {}) {
  const registro: Record<string, unknown>[] = [];

  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (opciones.lanza) throw new Error("la red se cayó");
      registro.push({ fn, ...args });
      return { data: null, error: opciones.errorRpc ? { message: opciones.errorRpc } : null };
    },
  } as unknown as SupabaseClient;

  return { servicio: new EventosPedidoService(supabase), registro };
}

describe("EventosPedidoService", () => {
  it("registra un correo con su asunto", async () => {
    const { servicio, registro } = montar();

    await servicio.registrar({
      pedidoId: "ped-1",
      tipo: "email",
      detalle: "Tu pedido va en camino",
      origen: "sistema",
    });

    expect(registro[0]).toEqual({
      fn: "registrar_evento_pedido",
      p_pedido_id: "ped-1",
      p_tipo: "email",
      p_detalle: "Tu pedido va en camino",
      p_importe: null,
      p_actor_id: null,
      p_origen: "sistema",
    });
  });

  it("registra un reembolso con su importe y su autor", async () => {
    const { servicio, registro } = montar();

    await servicio.registrar({
      pedidoId: "ped-1",
      tipo: "reembolso",
      importe: 12.5,
      actorId: "usuario-7",
      origen: "panel",
    });

    expect(registro[0]).toMatchObject({
      p_tipo: "reembolso",
      p_importe: 12.5,
      p_actor_id: "usuario-7",
      p_origen: "panel",
    });
  });

  /**
   * Un cobro que llega por el webhook no lo pidió nadie: el origen por defecto
   * tiene que reflejarlo en vez de atribuirlo al panel.
   */
  it("sin actor, el origen por defecto es el sistema", async () => {
    const { servicio, registro } = montar();

    await servicio.registrar({ pedidoId: "ped-1", tipo: "pago", importe: 49.99 });

    expect(registro[0]).toMatchObject({ p_actor_id: null, p_origen: "sistema" });
  });

  it("con actor y sin origen explícito, se asume el panel", async () => {
    const { servicio, registro } = montar();

    await servicio.registrar({ pedidoId: "ped-1", tipo: "pago", actorId: "usuario-7" });

    expect(registro[0]).toMatchObject({ p_origen: "panel" });
  });

  /**
   * El historial es la consecuencia del hecho, no el hecho. Que falle anotar un
   * correo no puede tumbar el envío, ni que falle anotar un cobro la venta.
   */
  describe("nunca tumba la operación que lo provocó", () => {
    it("si la RPC devuelve error", async () => {
      const { servicio } = montar({ errorRpc: "boom" });
      await expect(
        servicio.registrar({ pedidoId: "ped-1", tipo: "email", detalle: "x" }),
      ).resolves.toBeUndefined();
    });

    it("si la llamada revienta", async () => {
      const { servicio } = montar({ lanza: true });
      await expect(
        servicio.registrar({ pedidoId: "ped-1", tipo: "email", detalle: "x" }),
      ).resolves.toBeUndefined();
    });
  });
});
