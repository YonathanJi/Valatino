import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import {
  transicionesPermitidas,
  PEDIDO_ESTADOS,
  type PedidoEstado,
} from "@valatino/types";

/**
 * Doble mínimo del cliente de Supabase: solo lo que usa updateEstado
 * (select del estado actual + update del nuevo).
 */
function supabaseFalso(estadoActual: PedidoEstado | null) {
  const updates: Array<Record<string, unknown>> = [];

  const cliente = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            estadoActual === null
              ? { data: null, error: { message: "no rows" } }
              : { data: { estado: estadoActual }, error: null },
        }),
      }),
      update: (valores: Record<string, unknown>) => {
        updates.push(valores);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "p1", ...valores }, error: null }),
            }),
          }),
        };
      },
    }),
  };

  return { cliente, updates };
}

function servicioCon(estadoActual: PedidoEstado | null) {
  const { cliente, updates } = supabaseFalso(estadoActual);

  // El aviso al cliente se dispara sin await dentro de updateEstado, así que se
  // registra aquí para poder afirmar sobre él tras ceder el turno al event loop.
  const avisos: Array<{ estado: string; email: string }> = [];

  const inventario = {
    getPedidoConItems: async () => ({
      id: "p1",
      numero_pedido: "260725018055",
      estado: estadoActual,
      total: 49.99,
      metodo_pago: "stripe",
      email_cliente: "cliente@ejemplo.com",
      envio_nombre: "Ana Pérez",
      envio_linea1: "Calle Falsa 1",
      envio_linea2: null,
      envio_ciudad: "Madrid",
      envio_codigo_postal: "28001",
      envio_provincia: "Madrid",
      envio_pais: "ES",
      created_at: "2026-07-20T10:00:00Z",
      items: [{ nombre_producto: "Nucita", cantidad: 2, precio_unitario: 2.5 }],
    }),
  };

  const email = {
    enviarCambioEstado: async (datos: { estado: string; email: string }) => {
      avisos.push({ estado: datos.estado, email: datos.email });
    },
  };

  const reembolsos = { totalesReembolsados: async () => new Map<string, number>() };

  const servicio = new PedidosService(
    cliente as never,
    inventario as never,
    email as never,
    reembolsos as never,
  );

  return { servicio, updates, avisos };
}

/** Cede el turno para que corran los `void`s de notificarCambioEstado. */
const dejarQueSalgaElEmail = () => new Promise((r) => setImmediate(r));

describe("máquina de estados del pedido (@valatino/types)", () => {
  it("un estado final no admite ninguna transición", () => {
    expect(transicionesPermitidas("CANCELADO", "admin")).toEqual([]);
    expect(transicionesPermitidas("REEMBOLSADO", "admin")).toEqual([]);
  });

  it("el asesor puede avanzar el envío pero no cancelar", () => {
    expect(transicionesPermitidas("PROCESANDO", "asesor")).toEqual(["ENVIADO"]);
    expect(transicionesPermitidas("ENVIADO", "asesor")).toEqual(["ENTREGADO"]);
    expect(transicionesPermitidas("ENTREGADO", "asesor")).toEqual([]);

    for (const estado of PEDIDO_ESTADOS) {
      expect(transicionesPermitidas(estado, "asesor")).not.toContain("CANCELADO");
    }
  });

  /**
   * REEMBOLSADO se alcanza devolviendo el dinero (POST :id/reembolso o el
   * webhook), nunca eligiéndolo en el desplegable: cuando era una transición,
   * marcaba el pedido como reembolsado sin mover un euro en Stripe.
   */
  it("nadie puede llegar a REEMBOLSADO por una transición de estado", () => {
    for (const estado of PEDIDO_ESTADOS) {
      for (const rol of ["admin", "asesor"] as const) {
        expect(transicionesPermitidas(estado, rol)).not.toContain("REEMBOLSADO");
      }
    }
  });

  it("lo que ofrece el asesor es siempre un subconjunto de lo que ofrece el admin", () => {
    for (const estado of PEDIDO_ESTADOS) {
      const admin = transicionesPermitidas(estado, "admin");
      for (const t of transicionesPermitidas(estado, "asesor")) {
        expect(admin).toContain(t);
      }
    }
  });

  it("ninguna transición apunta a un estado inexistente", () => {
    for (const estado of PEDIDO_ESTADOS) {
      for (const destino of transicionesPermitidas(estado, "admin")) {
        expect(PEDIDO_ESTADOS).toContain(destino);
      }
    }
  });
});

describe("PedidosService.updateEstado", () => {
  it("acepta una transición permitida y sella updated_at", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "asesor");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ estado: "ENVIADO" });
    expect(updates[0]!["updated_at"]).toBeDefined();
  });

  it("rechaza que un asesor cancele un pedido y no escribe nada", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "CANCELADO", "asesor")).rejects.toThrow(
      ForbiddenException,
    );
    expect(updates).toHaveLength(0);
  });

  it("permite al admin cancelar el mismo pedido", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "CANCELADO", "admin");

    expect(updates[0]).toMatchObject({ estado: "CANCELADO" });
  });

  it("rechaza saltarse pasos (PROCESANDO → ENTREGADO)", async () => {
    const { servicio } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "ENTREGADO", "admin")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("no reabre un pedido ya reembolsado", async () => {
    const { servicio } = servicioCon("REEMBOLSADO");

    await expect(servicio.updateEstado("p1", "PROCESANDO", "admin")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("404 si el pedido no existe", async () => {
    const { servicio } = servicioCon(null);

    await expect(servicio.updateEstado("desconocido", "ENVIADO", "admin")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("PedidosService.updateEstado — aviso al cliente", () => {
  it("avisa al cliente del nuevo estado", async () => {
    const { servicio, avisos } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "asesor");
    await dejarQueSalgaElEmail();

    expect(avisos).toEqual([{ estado: "ENVIADO", email: "cliente@ejemplo.com" }]);
  });

  it("no avisa si la transición se rechazó", async () => {
    const { servicio, avisos } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "ENTREGADO", "admin")).rejects.toThrow(
      ForbiddenException,
    );
    await dejarQueSalgaElEmail();

    expect(avisos).toEqual([]);
  });

  /**
   * El estado ya está guardado cuando se intenta el envío: un SMTP caído no
   * puede deshacer la transición ni devolver un error al panel.
   */
  it("un fallo al enviar el email no rompe el cambio de estado", async () => {
    const { cliente, updates } = supabaseFalso("PROCESANDO");
    const servicio = new PedidosService(
      cliente as never,
      { getPedidoConItems: async () => ({ email_cliente: "x@y.z", items: [] }) } as never,
      {
        enviarCambioEstado: async () => {
          throw new Error("SMTP timeout");
        },
      } as never,
      { totalesReembolsados: async () => new Map() } as never,
    );

    await expect(servicio.updateEstado("p1", "ENVIADO", "admin")).resolves.toBeDefined();
    await dejarQueSalgaElEmail();

    expect(updates[0]).toMatchObject({ estado: "ENVIADO" });
  });
});
