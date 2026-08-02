import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import {
  transicionesPermitidas,
  NIVELES_PERMISO,
  PEDIDO_ESTADOS,
  type PedidoEstado,
} from "@valatino/types";

/**
 * Doble mínimo del cliente de Supabase: solo lo que usa updateEstado
 * (select del estado actual + la RPC que lo cambia).
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
    }),
    // El cambio va por RPC para que ocurra en la misma transacción que su
    // registro en el historial, y para que el trigger sepa quién lo hizo.
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "cambiar_estado_pedido") throw new Error(`rpc inesperada: ${fn}`);
      updates.push({ estado: args.p_estado, actor: args.p_actor_id });
      return { data: { id: "p1", estado: args.p_estado }, error: null };
    },
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
  // La ficha adjunta la opinión del cliente; aquí no se prueba, así que devuelve
  // el caso normal: la gran mayoría de los pedidos no están calificados.
  const calificaciones = { porPedido: async () => null };

  const servicio = new PedidosService(
    cliente as never,
    inventario as never,
    email as never,
    reembolsos as never,
    calificaciones as never,
  );

  return { servicio, updates, avisos };
}

/** Cede el turno para que corran los `void`s de notificarCambioEstado. */
const dejarQueSalgaElEmail = () => new Promise((r) => setImmediate(r));

/**
 * Doble para los dos endpoints que ve el cliente en «Mis pedidos». Registra si
 * se llegó a preguntar por lo devuelto, que es lo que permite comprobar que un
 * pedido ajeno se corta ANTES de leer nada suyo.
 */
function servicioDeCliente(opciones: {
  pedidos: Array<Record<string, unknown>>;
  totales?: Map<string, number>;
  articulos?: Map<string, unknown[]>;
}) {
  const { pedidos, totales = new Map(), articulos = new Map() } = opciones;
  const consultasDeReembolso: string[] = [];

  const cliente = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async () => ({ data: pedidos, count: pedidos.length, error: null }),
          }),
          single: async () =>
            pedidos[0]
              ? { data: pedidos[0], error: null }
              : { data: null, error: { message: "no rows" } },
        }),
      }),
    }),
  };

  const reembolsos = {
    totalesReembolsados: async (ids: string[]) => {
      consultasDeReembolso.push(`totales:${ids.join(",")}`);
      return totales;
    },
    articulosDevueltos: async (ids: string[]) => {
      consultasDeReembolso.push(`articulos:${ids.join(",")}`);
      return articulos;
    },
  };

  const servicio = new PedidosService(
    cliente as never,
    {} as never,
    {} as never,
    reembolsos as never,
    {} as never,
  );

  return { servicio, consultasDeReembolso };
}

const NUCITA_DEVUELTA = {
  nombre_producto: "Nucita",
  cantidad: 1,
  importe: 2.5,
  fecha: "2026-08-02T10:00:00Z",
};

describe("PedidosService — lo que el cliente ve de sus devoluciones", () => {
  /**
   * La razón de ser de todo esto: un reembolso PARCIAL no cambia el estado del
   * pedido, así que la etiqueta de estado no puede ser el único sitio donde se
   * cuente. Sin estos campos el cliente no se entera de que le han abonado algo.
   */
  it("un pedido en ENVIADO con devolución parcial la trae igualmente", async () => {
    const { servicio } = servicioDeCliente({
      pedidos: [{ id: "p1", user_id: "u1", estado: "ENVIADO", total: 6.3 }],
      totales: new Map([["p1", 2.5]]),
      articulos: new Map([["p1", [NUCITA_DEVUELTA]]]),
    });

    const r = await servicio.findByUser("u1");

    expect(r.data[0]).toMatchObject({
      estado: "ENVIADO",
      total_reembolsado: 2.5,
      articulos_devueltos: [NUCITA_DEVUELTA],
    });
  });

  it("un pedido sin devoluciones sale con 0 y sin artículos, no con undefined", async () => {
    const { servicio } = servicioDeCliente({
      pedidos: [{ id: "p1", user_id: "u1", estado: "ENTREGADO", total: 10 }],
    });

    const r = await servicio.findByUser("u1");

    expect(r.data[0]).toMatchObject({ total_reembolsado: 0, articulos_devueltos: [] });
  });

  /**
   * Devolución por importe suelto (o hecha desde el panel de Stripe): hay dinero
   * devuelto pero no consta de qué artículo. Se muestra el importe igual —callar
   * la cifra por no tener el detalle sería lo peor de las dos opciones.
   */
  it("con dinero devuelto pero sin artículo, el importe se conserva", async () => {
    const { servicio } = servicioDeCliente({
      pedidos: [{ id: "p1", user_id: "u1", estado: "ENVIADO", total: 10 }],
      totales: new Map([["p1", 3]]),
    });

    const r = await servicio.findByUser("u1");

    expect(r.data[0]).toMatchObject({ total_reembolsado: 3, articulos_devueltos: [] });
  });

  it("findOneByUser adjunta la devolución del pedido propio", async () => {
    const { servicio } = servicioDeCliente({
      pedidos: [{ id: "p1", user_id: "u1", estado: "ENVIADO", total: 6.3 }],
      totales: new Map([["p1", 2.5]]),
      articulos: new Map([["p1", [NUCITA_DEVUELTA]]]),
    });

    const r = await servicio.findOneByUser("p1", "u1");

    expect(r.total_reembolsado).toBe(2.5);
    expect(r.articulos_devueltos).toEqual([NUCITA_DEVUELTA]);
  });

  /**
   * Un pedido ajeno se corta antes de leer nada suyo. Consultar lo devuelto y
   * descartarlo después al fallar el guard sigue siendo haberlo leído.
   */
  it("un pedido de otro cliente se rechaza sin llegar a consultar sus devoluciones", async () => {
    const { servicio, consultasDeReembolso } = servicioDeCliente({
      pedidos: [{ id: "p1", user_id: "OTRO", estado: "ENVIADO", total: 6.3 }],
    });

    await expect(servicio.findOneByUser("p1", "u1")).rejects.toThrow(ForbiddenException);
    expect(consultasDeReembolso).toEqual([]);
  });
});

describe("máquina de estados del pedido (@valatino/types)", () => {
  it("un estado final no admite ninguna transición", () => {
    expect(transicionesPermitidas("CANCELADO", "total")).toEqual([]);
    expect(transicionesPermitidas("REEMBOLSADO", "total")).toEqual([]);
  });

  /**
   * Caso nuevo con los niveles: antes no existía forma de ver pedidos sin poder
   * moverlos, así que el desplegable siempre tenía algo que ofrecer.
   */
  it("con solo lectura no se ofrece ninguna transición", () => {
    for (const estado of PEDIDO_ESTADOS) {
      expect(transicionesPermitidas(estado, "lectura")).toEqual([]);
    }
  });

  it("con edición se avanza el envío pero no se cancela", () => {
    expect(transicionesPermitidas("PROCESANDO", "edicion")).toEqual(["ENVIADO"]);
    expect(transicionesPermitidas("ENVIADO", "edicion")).toEqual(["ENTREGADO"]);
    expect(transicionesPermitidas("ENTREGADO", "edicion")).toEqual([]);

    for (const estado of PEDIDO_ESTADOS) {
      expect(transicionesPermitidas(estado, "edicion")).not.toContain("CANCELADO");
    }
  });

  it("cancelar exige control total, igual que reembolsar", () => {
    expect(transicionesPermitidas("PENDIENTE_PAGO", "total")).toContain("CANCELADO");
    expect(transicionesPermitidas("PROCESANDO", "total")).toContain("CANCELADO");
  });

  /**
   * REEMBOLSADO se alcanza devolviendo el dinero (POST :id/reembolso o el
   * webhook), nunca eligiéndolo en el desplegable: cuando era una transición,
   * marcaba el pedido como reembolsado sin mover un euro en Stripe.
   */
  it("nadie puede llegar a REEMBOLSADO por una transición de estado", () => {
    for (const estado of PEDIDO_ESTADOS) {
      for (const nivel of NIVELES_PERMISO) {
        expect(transicionesPermitidas(estado, nivel)).not.toContain("REEMBOLSADO");
      }
    }
  });

  it("cada nivel ofrece un subconjunto de lo que ofrece el siguiente", () => {
    for (const estado of PEDIDO_ESTADOS) {
      const total = transicionesPermitidas(estado, "total");
      const edicion = transicionesPermitidas(estado, "edicion");

      for (const t of edicion) expect(total).toContain(t);
      for (const t of transicionesPermitidas(estado, "lectura")) expect(edicion).toContain(t);
    }
  });

  it("ninguna transición apunta a un estado inexistente", () => {
    for (const estado of PEDIDO_ESTADOS) {
      for (const destino of transicionesPermitidas(estado, "total")) {
        expect(PEDIDO_ESTADOS).toContain(destino);
      }
    }
  });
});

describe("PedidosService.updateEstado", () => {
  it("acepta una transición permitida", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "edicion");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ estado: "ENVIADO" });
  });

  it("pasa quién lo hizo, que es lo que acaba en el historial", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "edicion", "usuario-7");

    expect(updates[0]).toMatchObject({ estado: "ENVIADO", actor: "usuario-7" });
  });

  /**
   * El webhook y el checkout cambian el estado sin persona detrás. El historial
   * debe poder decirlo, no inventarse un autor.
   */
  it("sin actor, la RPC recibe null y el cambio queda como del sistema", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "edicion");

    expect(updates[0]).toMatchObject({ actor: null });
  });

  it("rechaza que con edición se cancele un pedido y no escribe nada", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "CANCELADO", "edicion")).rejects.toThrow(
      ForbiddenException,
    );
    expect(updates).toHaveLength(0);
  });

  it("permite al admin cancelar el mismo pedido", async () => {
    const { servicio, updates } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "CANCELADO", "total");

    expect(updates[0]).toMatchObject({ estado: "CANCELADO" });
  });

  it("rechaza saltarse pasos (PROCESANDO → ENTREGADO)", async () => {
    const { servicio } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "ENTREGADO", "total")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("no reabre un pedido ya reembolsado", async () => {
    const { servicio } = servicioCon("REEMBOLSADO");

    await expect(servicio.updateEstado("p1", "PROCESANDO", "total")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("404 si el pedido no existe", async () => {
    const { servicio } = servicioCon(null);

    await expect(servicio.updateEstado("desconocido", "ENVIADO", "total")).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("PedidosService.updateEstado — aviso al cliente", () => {
  it("avisa al cliente del nuevo estado", async () => {
    const { servicio, avisos } = servicioCon("PROCESANDO");

    await servicio.updateEstado("p1", "ENVIADO", "edicion");
    await dejarQueSalgaElEmail();

    expect(avisos).toEqual([{ estado: "ENVIADO", email: "cliente@ejemplo.com" }]);
  });

  it("no avisa si la transición se rechazó", async () => {
    const { servicio, avisos } = servicioCon("PROCESANDO");

    await expect(servicio.updateEstado("p1", "ENTREGADO", "total")).rejects.toThrow(
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
      { porPedido: async () => null } as never,
    );

    await expect(servicio.updateEstado("p1", "ENVIADO", "total")).resolves.toBeDefined();
    await dejarQueSalgaElEmail();

    expect(updates[0]).toMatchObject({ estado: "ENVIADO" });
  });
});
